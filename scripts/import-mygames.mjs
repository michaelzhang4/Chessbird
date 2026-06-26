/**
 * Mine tactics from a chess.com player's own games into a Woodpecker set.
 * Fetches recent games via the public API, runs each user-to-move position through a
 * provided Stockfish binary, and keeps positions with a single decisively-winning move.
 * Solutions are the engine PV verbatim (opponent replies included) so they pass the
 * exact-match solver in boardController.ts isCorrect().
 *
 *   node scripts/import-mygames.mjs <user> [setId] ["Title"] [flags]
 *   node scripts/import-mygames.mjs Jendire jendire-test "Jendire Test" --max-games 3 --dry-run
 *
 * Engine: --stockfish <path> | $STOCKFISH_PATH | auto-detected stockfish/stockfish-*.exe.
 * The binary is never committed; only the produced set + manifest change on disk.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { cpus } from 'node:os';
import { Chess } from 'chess.js';
import { rebuildManifest } from './rebuild-manifest.mjs';
import { posKey } from './lib/study.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const UA = 'Chessbird-importer/1.0 (personal puzzle trainer; +https://github.com/michaelzhang4/Chessbird)';
const MATE_BASE = 100000; // mate scores collapse to a huge cp-equivalent preserving order
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- CLI ---------------------------------------------------------------------
const argv = process.argv.slice(2);
const positional = [];
const opts = {};
for (let i = 0; i < argv.length; i++) {
	const a = argv[i];
	if (a.startsWith('--')) {
		const key = a.slice(2);
		const next = argv[i + 1];
		if (next === undefined || next.startsWith('--')) opts[key] = true; // boolean flag
		else { opts[key] = next; i++; }
	} else positional.push(a);
}
const user = positional[0];
if (!user) {
	console.error('Usage: node scripts/import-mygames.mjs <user> [setId] ["Title"] [flags]');
	process.exit(1);
}
const setId = positional[1] || `chesscom-${user.toLowerCase()}-tactics`;
const title = positional[2] || `${user} — game tactics`;

const num = (k, d) => (opts[k] !== undefined ? Number(opts[k]) : d);
const cfg = {
	timeClasses: String(opts['time-class'] ?? 'rapid').split(',').map((s) => s.trim()).filter(Boolean),
	rated: opts['no-rated'] ? false : true,
	months: num('months', 4),
	maxGames: num('max-games', 150),
	maxPuzzles: num('max-puzzles', 80),
	side: opts['side'] === 'both' ? 'both' : 'me',
	skipPlies: num('skip-plies', 12),
	depth: num('depth', 16),
	prefilterDepth: num('prefilter-depth', 8),
	cpThreshold: num('cp-threshold', 200),
	gap: num('gap', 150),
	prevMargin: num('prev-margin', 100),
	maxLinePlies: num('max-line-plies', 6),
	threads: num('threads', Math.max(1, cpus().length - 1)),
	hash: num('hash', 128),
	dryRun: !!opts['dry-run']
};

// ---- engine resolution -------------------------------------------------------
function detectEngine() {
	if (opts['stockfish']) return String(opts['stockfish']);
	if (process.env.STOCKFISH_PATH) return process.env.STOCKFISH_PATH;
	try {
		const dir = join(root, 'stockfish');
		const files = readdirSync(dir);
		const exe =
			files.find((f) => /^stockfish.*\.exe$/i.test(f)) ||
			files.find((f) => /^stockfish/i.test(f) && !f.endsWith('.txt'));
		if (exe) return join(dir, exe);
	} catch { /* no stockfish dir */ }
	return null;
}

// ---- Stockfish UCI driver (one long-lived process, serialized `go`s) ---------
function parseInfo(line) {
	const t = line.split(/\s+/);
	let depth, multipv = 1, cp = null, mate = null, pv = null;
	for (let i = 0; i < t.length; i++) {
		const w = t[i];
		if (w === 'depth') depth = Number(t[i + 1]);
		else if (w === 'multipv') multipv = Number(t[i + 1]);
		else if (w === 'score') {
			if (t[i + 1] === 'cp') cp = Number(t[i + 2]);
			else if (t[i + 1] === 'mate') mate = Number(t[i + 2]);
		} else if (w === 'pv') { pv = t.slice(i + 1); break; }
	}
	return { depth, multipv, cp, mate, pv };
}
/** Side-to-move POV score as a single comparable number (mate → signed sentinel). */
const scoreVal = (e) => (e.mate != null ? (e.mate > 0 ? 1 : -1) * (MATE_BASE - Math.abs(e.mate)) : e.cp ?? 0);

class Engine {
	constructor(path) {
		this.path = path;
		this.multipv = 0;
		this.exited = false;
	}
	send(s) { this.proc.stdin.write(s + '\n'); }
	_cmdWait(cmd, isDone) {
		return new Promise((resolve, reject) => {
			this._reject = reject;
			this.lineHandler = (l) => { if (isDone(l)) { this.lineHandler = null; this._reject = null; resolve(); } };
			this.send(cmd);
		});
	}
	async start() {
		this.proc = spawn(this.path, [], { windowsHide: true });
		this.proc.on('error', (e) => { throw new Error(`cannot launch engine: ${e.message}`); });
		this.proc.on('exit', (code) => {
			this.exited = true;
			if (this._reject) this._reject(new Error(`engine exited (code ${code})`));
		});
		this.rl = createInterface({ input: this.proc.stdout });
		this.rl.on('line', (l) => { if (this.lineHandler) this.lineHandler(l); });
		await this._cmdWait('uci', (l) => l.trim() === 'uciok');
		this.send(`setoption name Threads value ${cfg.threads}`);
		this.send(`setoption name Hash value ${cfg.hash}`);
		await this._cmdWait('isready', (l) => l.trim() === 'readyok');
	}
	/** Analyse one position; resolves to multipv-sorted lines [{multipv,depth,cp,mate,pv}]. */
	analyse(fen, depth, multipv) {
		if (this.multipv !== multipv) { this.send(`setoption name MultiPV value ${multipv}`); this.multipv = multipv; }
		this.send('ucinewgame');
		this.send(`position fen ${fen}`);
		const map = new Map();
		return new Promise((resolve) => {
			let done = false;
			const finish = () => { if (done) return; done = true; clearTimeout(soft); clearTimeout(hard); this.lineHandler = null; resolve([...map.values()].sort((a, b) => a.multipv - b.multipv)); };
			const soft = setTimeout(() => this.send('stop'), 20000);        // nudge a hung search
			const hard = setTimeout(finish, 25000);                          // give up, use what we have
			this.lineHandler = (l) => {
				if (l.startsWith('info ')) {
					if (l.includes(' lowerbound') || l.includes(' upperbound')) return;
					const e = parseInfo(l);
					if (e.multipv != null && e.pv && e.pv.length) map.set(e.multipv, e); // deepest line per pv wins
				} else if (l.startsWith('bestmove')) finish();
			};
			this.send(`go depth ${depth}`);
		});
	}
	quit() { try { this.send('quit'); } catch { /* already gone */ } }
}

// ---- chess.com fetch ---------------------------------------------------------
async function cfetch(url, { retries = 4, json = false } = {}) {
	for (let attempt = 0; attempt <= retries; attempt++) {
		const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
		if (res.ok) return json ? res.json() : res.text();
		if (res.status === 404) return null;
		if (res.status === 429 || res.status >= 500) { await sleep(2000 * (attempt + 1)); continue; }
		throw new Error(`${res.status} ${res.statusText} for ${url}`);
	}
	throw new Error(`gave up after ${retries} retries (rate-limited?) for ${url}`);
}

/** Pull recent games (newest-first), filtered to the configured time-class / rated. */
async function fetchGames() {
	const lc = user.toLowerCase();
	const arch = await cfetch(`https://api.chess.com/pub/player/${lc}/games/archives`, { json: true });
	if (arch === null) { console.error(`chess.com user "${user}" not found.`); process.exit(1); }
	const urls = (arch.archives || []).slice(-cfg.months).reverse(); // newest months first
	const games = [];
	for (const u of urls) {
		if (games.length >= cfg.maxGames) break;
		const month = await cfetch(u, { json: true });
		const monthGames = (month?.games || []).reverse(); // newest game first within month
		for (const g of monthGames) {
			if (games.length >= cfg.maxGames) break;
			if (g.rules !== 'chess') continue;
			if (cfg.rated && !g.rated) continue;
			if (!cfg.timeClasses.includes(g.time_class)) continue;
			if (!g.pgn) continue;
			if (/\[Variant\s+"(?!Standard)/i.test(g.pgn)) continue; // non-standard variant
			if (/\[SetUp\s+"1"\]/i.test(g.pgn) || /\[FEN\s+"/i.test(g.pgn)) continue; // Chess960 / odd start
			const whiteUser = g.white?.username?.toLowerCase();
			const userColor = whiteUser === lc ? 'w' : g.black?.username?.toLowerCase() === lc ? 'b' : null;
			if (!userColor) continue;
			games.push({
				url: g.url,
				pgn: g.pgn,
				userColor,
				ratingByColor: { w: Number(g.white?.rating) || undefined, b: Number(g.black?.rating) || undefined }
			});
		}
		await sleep(400); // polite between archive fetches
	}
	return games;
}

/** Replay a game's PGN into per-ply records (fen before the move + the move played). */
function gamePlies(pgn) {
	const parser = new Chess();
	try { parser.loadPgn(pgn); } catch { return null; }
	const hist = parser.history({ verbose: true });
	const replay = new Chess();
	const plies = [];
	for (const mv of hist) {
		const fenBefore = replay.fen();
		const side = replay.turn();
		try { replay.move({ from: mv.from, to: mv.to, promotion: mv.promotion }); }
		catch { return null; }
		plies.push({ fenBefore, side, uci: mv.from + mv.to + (mv.promotion ?? '') });
	}
	return plies;
}

/** Turn the engine PV into a legal, exact-match solution line ending on the solver's move. */
function buildSolution(fen, pvUci, maxPlies) {
	const ch = new Chess(fen);
	const out = [];
	let mate = false;
	for (const u of pvUci) {
		if (out.length >= maxPlies) break;
		let mv;
		try { mv = ch.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }); }
		catch { break; }
		if (!mv) break;
		out.push(mv.from + mv.to + (mv.promotion ?? ''));
		if (ch.isCheckmate()) { mate = true; break; }
	}
	if (!mate && out.length % 2 === 0) out.pop(); // end on the solver's move (odd length)
	return { moves: out, mate };
}

// ---- main --------------------------------------------------------------------
const enginePath = detectEngine();
if (!enginePath) {
	console.error(
		'No Stockfish engine found. Provide one of:\n' +
		'  --stockfish <path>\n' +
		'  set STOCKFISH_PATH=<path>\n' +
		'  place the binary at stockfish/stockfish-*.exe in the repo\n' +
		'Download: https://stockfishchess.org/download/  (or: winget install Stockfish)'
	);
	process.exit(1);
}

const engine = new Engine(enginePath);
try { await engine.start(); }
catch (e) { console.error(`Engine failed to start (${enginePath}): ${e.message}`); process.exit(1); }
console.log(`Engine ready: ${enginePath} · ${cfg.threads} threads, ${cfg.hash}MB hash`);

console.log(`Fetching ${user}'s ${cfg.timeClasses.join('/')} ${cfg.rated ? 'rated ' : ''}games (last ${cfg.months} months, max ${cfg.maxGames})…`);
const games = await fetchGames();
console.log(`Got ${games.length} games to analyze.`);

const seen = new Set();
const puzzles = [];
let analyzed = 0, candidates = 0;

for (let gi = 0; gi < games.length; gi++) {
	const game = games[gi];
	const plies = gamePlies(game.pgn);
	if (!plies || plies.length < cfg.skipPlies + 1) continue;
	analyzed++;
	process.stdout.write(`  game ${gi + 1}/${games.length} (${plies.length} plies) · puzzles ${puzzles.length}\r`);

	for (let p = cfg.skipPlies; p < plies.length; p++) {
		const { fenBefore, side, uci: playedUci } = plies[p];
		const isUser = side === game.userColor;
		if (cfg.side === 'me' && !isUser) continue;

		// cheap prefilter: is there any decisively-winning move here at all?
		if (cfg.prefilterDepth > 0) {
			const pre = await engine.analyse(fenBefore, cfg.prefilterDepth, 1);
			if (!pre[0] || scoreVal(pre[0]) < cfg.cpThreshold) continue;
		}
		candidates++;

		// confirm with a deeper, 2-line search: unique winning move?
		const res = await engine.analyse(fenBefore, cfg.depth, 2);
		const r1 = res.find((r) => r.multipv === 1);
		if (!r1 || !r1.pv?.length) continue;
		const r2 = res.find((r) => r.multipv === 2);
		const e1 = scoreVal(r1);
		const e2 = r2 ? scoreVal(r2) : -Infinity;
		if (e1 < cfg.cpThreshold) continue;        // best move isn't decisively winning
		if (e1 - e2 < cfg.gap) continue;           // best & second too close → not forcing
		if (e2 >= cfg.cpThreshold) continue;       // second move also wins → not unique

		// anti-trivial: was the user already clearly winning before this chance arose?
		if (cfg.prevMargin > 0 && p > 0 && cfg.prefilterDepth > 0) {
			const parent = await engine.analyse(plies[p - 1].fenBefore, cfg.prefilterDepth, 1);
			if (parent[0] && -scoreVal(parent[0]) >= cfg.prevMargin) continue; // negate: parent is opponent-to-move
		}

		const { moves, mate } = buildSolution(fenBefore, r1.pv, cfg.maxLinePlies);
		if (!moves.length) continue;

		const k = posKey(fenBefore);
		if (seen.has(k)) continue;
		seen.add(k);

		const found = moves[0] === playedUci; // did the player actually find the best move?
		const themes = [found ? 'found' : 'missed'];
		if (mate) themes.push('mate');
		puzzles.push({
			id: `${setId}_${String(puzzles.length + 1).padStart(4, '0')}`,
			fen: fenBefore,
			moves,
			setupMoveFirst: false,
			solverColor: side,
			rating: game.ratingByColor[side],
			themes,
			sourceUrl: game.url,
			source: 'chess.com',
			_score: e1,
			_missed: !found
		});
	}
}
process.stdout.write('\n');

engine.quit();

const foundCount = puzzles.filter((p) => !p._missed).length;
const missedCount = puzzles.length - foundCount;

// missed chances first (most instructive), then sharpest tactics
puzzles.sort((a, b) => (Number(b._missed) - Number(a._missed)) || (b._score - a._score));
const kept = puzzles.slice(0, cfg.maxPuzzles);
const keptMissed = kept.filter((p) => p._missed).length;
for (const p of kept) { delete p._score; delete p._missed; }

console.log(
	`\nAnalyzed ${analyzed} games · ${candidates} prefilter hits · ` +
	`${puzzles.length} tactics found (${foundCount} found, ${missedCount} missed) · keeping ${kept.length}`
);

if (cfg.dryRun) {
	console.log('\n--dry-run: no file written. Sample puzzles:');
	for (const p of kept.slice(0, 8)) {
		console.log(`  ${p.themes.join('+').padEnd(14)} ${p.moves.join(' ').padEnd(28)} ${p.sourceUrl}`);
	}
	process.exit(0);
}

if (!kept.length) { console.error('No tactics found — nothing written.'); process.exit(1); }

const ratings = kept.map((p) => p.rating).filter((r) => typeof r === 'number').sort((a, b) => a - b);
const setFile = {
	schema: 'woodpecker-set@1',
	id: setId,
	title: title || setId,
	description:
		`Tactics mined from ${user}'s ${cfg.timeClasses.join('/')} games on chess.com ` +
		`(${kept.length} of ${puzzles.length} found across ${analyzed} games; ${keptMissed} were missed in-game). ` +
		`Ratings are approximate — the player's game rating at the time.`,
	createdAt: new Date().toISOString().slice(0, 10),
	source: 'chess.com',
	puzzles: kept
};
writeFileSync(join(root, 'static', 'data', 'sets', `${setId}.json`), JSON.stringify(setFile, null, 2) + '\n');
const total = rebuildManifest(root);
console.log(
	`Wrote ${kept.length} puzzles -> ${setId}.json` +
	(ratings.length ? ` · ratings ${ratings[0]}–${ratings[ratings.length - 1]} (median ${ratings[ratings.length >> 1]})` : '') +
	` · manifest now ${total} sets`
);
