/**
 * Tiny client-side Stockfish driver for the review/explore eval bar.
 * Runs a single-threaded WASM build (static/engine/stockfish.wasm.js) in a Web Worker —
 * no server, no SharedArrayBuffer, no special headers, so it works on GitHub Pages.
 *
 * Browser-only: construct from onMount. Analyses are serialized — a new analyze()
 * cancels the running search and starts once the engine reports `bestmove`, so streamed
 * `info` lines are never mis-attributed to a stale position.
 */
import { base } from '$app/paths';

export interface EngineEval {
	depth: number;
	multipv: number;
	cp?: number; // centipawns, side-to-move POV
	mate?: number; // mate in N, side-to-move POV
	pv: string[]; // principal variation, UCI
}

type InfoCb = (info: EngineEval) => void;

function parseInfo(line: string): EngineEval | null {
	const t = line.split(/\s+/);
	let depth = 0,
		multipv = 1,
		cp: number | undefined,
		mate: number | undefined,
		pv: string[] = [];
	for (let i = 0; i < t.length; i++) {
		const w = t[i];
		if (w === 'depth') depth = Number(t[i + 1]);
		else if (w === 'multipv') multipv = Number(t[i + 1]);
		else if (w === 'score') {
			if (t[i + 1] === 'cp') cp = Number(t[i + 2]);
			else if (t[i + 1] === 'mate') mate = Number(t[i + 2]);
		} else if (w === 'pv') {
			pv = t.slice(i + 1);
			break;
		}
	}
	if (cp === undefined && mate === undefined) return null;
	return { depth, multipv, cp, mate, pv };
}

export class Engine {
	private worker: Worker | null = null;
	private ready = false;
	failed = false;

	private handshake: ((line: string) => void) | null = null;
	private current: { fen: string; depth: number; cb: InfoCb } | null = null;
	private pending: { fen: string; depth: number; cb: InfoCb } | null = null;
	private searching = false;
	private initPromise: Promise<void> | null = null;

	/** Idempotent: every caller awaits the same readiness promise (no init races). */
	init(): Promise<void> {
		if (!this.initPromise) this.initPromise = this.doInit();
		return this.initPromise;
	}

	private async doInit(): Promise<void> {
		if (this.worker || this.failed) return;
		try {
			this.worker = new Worker(`${base}/engine/stockfish.wasm.js`);
		} catch {
			this.failed = true;
			return;
		}
		this.worker.onerror = () => {
			this.failed = true;
		};
		this.worker.onmessage = (e: MessageEvent) => {
			const line = typeof e.data === 'string' ? e.data : (e.data?.data ?? '');
			this.onLine(line);
		};
		if (!(await this.handshakeCmd('uci', (l) => l === 'uciok'))) {
			this.failed = true;
			return;
		}
		this.send('setoption name MultiPV value 1');
		if (!(await this.handshakeCmd('isready', (l) => l === 'readyok'))) {
			this.failed = true;
			return;
		}
		this.ready = true;
	}

	private send(s: string): void {
		this.worker?.postMessage(s);
	}

	/** Send a command and wait for the line that satisfies `done`, or time out (engine broken). */
	private handshakeCmd(cmd: string, done: (l: string) => boolean): Promise<boolean> {
		return new Promise((resolve) => {
			const t = setTimeout(() => {
				this.handshake = null;
				resolve(false);
			}, 8000);
			this.handshake = (l) => {
				if (done(l.trim())) {
					this.handshake = null;
					clearTimeout(t);
					resolve(true);
				}
			};
			this.send(cmd);
		});
	}

	private onLine(line: string): void {
		if (this.handshake) this.handshake(line);
		if (line.startsWith('info ')) {
			if (line.includes(' lowerbound') || line.includes(' upperbound')) return;
			if (!this.current) return;
			const info = parseInfo(line);
			if (info && info.pv.length) this.current.cb(info);
		} else if (line.startsWith('bestmove')) {
			this.searching = false;
			this.drive();
		}
	}

	/** Request analysis of `fen`; supersedes any in-flight request. */
	analyze(fen: string, depth: number, cb: InfoCb): void {
		this.pending = { fen, depth, cb };
		void this.init().then(() => this.drive());
	}

	private drive(): void {
		if (!this.ready || this.failed) return;
		if (this.searching) {
			this.send('stop'); // resume from onLine('bestmove')
			return;
		}
		if (!this.pending) return;
		this.current = this.pending;
		this.pending = null;
		this.searching = true;
		this.send(`position fen ${this.current.fen}`);
		this.send(`go depth ${this.current.depth}`);
	}

	stop(): void {
		this.pending = null;
		this.current = null;
		if (this.searching) this.send('stop');
	}

	quit(): void {
		this.stop();
		this.worker?.terminate();
		this.worker = null;
		this.ready = false;
		this.initPromise = null;
	}
}

/** Logistic win-probability for White (0..1) from a White-POV score, for the eval bar fill. */
export function whiteWinProb(cp: number | undefined, mate: number | undefined): number {
	if (mate !== undefined) return mate > 0 ? 1 : 0;
	return 1 / (1 + Math.exp(-(cp ?? 0) / 400));
}

/** Human-readable, White-POV score label (e.g. "+2.3", "−1.0", "M5"). */
export function formatEval(cp: number | undefined, mate: number | undefined): string {
	if (mate !== undefined) return (mate > 0 ? 'M' : '−M') + Math.abs(mate);
	const v = (cp ?? 0) / 100;
	return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1);
}
