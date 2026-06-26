/**
 * Solvability check for a generated set: drive the real app and play each puzzle's
 * scripted solver moves, asserting the solve counter advances with no rejected move.
 * Proves the mined lines satisfy boardController.ts isCorrect() (exact-match solving).
 *
 *   cb preview                       # in one terminal (dev server on :5173)
 *   node scripts/e2e-verify-set.mjs <setId> [howMany]
 */
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const setId = process.argv[2];
const howMany = Number(process.argv[3]) || 5;
if (!setId) { console.error('Usage: node scripts/e2e-verify-set.mjs <setId> [howMany]'); process.exit(1); }

const BASE = process.env.E2E_BASE || 'http://localhost:5173';
const OUT = 'verify-shots';
mkdirSync(OUT, { recursive: true });

const set = JSON.parse(readFileSync(join(root, 'static', 'data', 'sets', `${setId}.json`), 'utf8'));
const puzzles = set.puzzles.slice(0, howMany);
const log = (...a) => console.log('•', ...a);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 430, height: 920 } });
page.on('dialog', (d) => d.accept());
page.on('pageerror', (e) => console.log('!! pageerror:', e.message));

async function clickSquare(sq, orientation) {
	const box = await page.locator('.cg-wrap').boundingBox();
	const s = box.width / 8;
	const file = sq.charCodeAt(0) - 97;
	const rank = Number(sq[1]);
	const cx = orientation === 'w' ? box.x + (file + 0.5) * s : box.x + (7 - file + 0.5) * s;
	const cy = orientation === 'w' ? box.y + (8 - rank + 0.5) * s : box.y + (rank - 1 + 0.5) * s;
	await page.mouse.click(cx, cy);
}
async function move(uci, orientation) {
	await clickSquare(uci.slice(0, 2), orientation);
	await page.waitForTimeout(150);
	await clickSquare(uci.slice(2, 4), orientation);
}
const solvedCount = async () =>
	page.evaluate(() => Number(document.body.innerText.match(/Cycle 1 · (\d+)\/\d+/)?.[1] ?? -1));

let solved = 0, failures = 0;
try {
	// Start a fresh program for this set, then enter the solver.
	await page.goto(`${BASE}/set/${setId}`, { waitUntil: 'networkidle' });
	await page.getByRole('button', { name: /Skip assessment/ }).click();
	await page.waitForTimeout(800);
	await page.goto(`${BASE}/solve`, { waitUntil: 'networkidle' });
	await page.locator('.cg-wrap').waitFor();
	await page.waitForTimeout(600);

	// The daily-goal modal ("Keep going / I'm done") overlays the board once the goal is hit.
	const dismissGoalModal = async () => {
		const btn = page.getByRole('button', { name: /Keep going/ });
		if (await btn.isVisible().catch(() => false)) { await btn.click(); await page.waitForTimeout(400); }
	};

	// After solving, the board stays in review; advance with the "Next" button.
	const advance = page.getByRole('button', { name: /Next puzzle|Finish cycle|Done →/ });

	for (let i = 0; i < puzzles.length; i++) {
		const pz = puzzles[i];
		await dismissGoalModal();
		const before = await solvedCount();
		// solver plays the even-indexed plies; opponent replies (odd) auto-play
		for (let j = 0; j < pz.moves.length; j += 2) {
			await move(pz.moves[j], pz.solverColor);
			await page.waitForTimeout(1200); // our move + auto-reply + re-enable
		}
		// solve registers the counter and surfaces the review panel (with its Next button)
		const after = await solvedCount();
		const reviewed = await advance.isVisible().catch(() => false);
		const wrong = await page.evaluate(() => /Not the move/.test(document.body.innerText));
		if (!wrong && reviewed && after === before + 1) {
			solved++;
			log(`puzzle ${i + 1}/${puzzles.length} SOLVED · ${pz.moves.join(' ')} (${pz.themes?.join('+') || ''})`);
		} else {
			failures++;
			await page.screenshot({ path: `${OUT}/fail-${setId}-${i + 1}.png` });
			log(`puzzle ${i + 1}/${puzzles.length} FAILED · counter ${before}→${after}${wrong ? ' · "Not the move"' : ''}${reviewed ? '' : ' · no review panel'} · ${pz.moves.join(' ')}`);
			break; // the flow is stuck — stop rather than mis-drive the rest
		}
		await advance.click(); // leave review → next puzzle (or finish)
		await page.waitForTimeout(700);
		await dismissGoalModal(); // goal prompt can appear after advancing
	}

	console.log('\n===== SOLVABILITY =====');
	console.log(`${solved}/${puzzles.length} solved · ${failures} failed`);
	console.log('VERDICT:', failures === 0 && solved === puzzles.length ? 'ALL SOLVABLE ✅' : 'UNSOLVABLE LINES ❌');
	if (failures) process.exitCode = 1;
} catch (e) {
	console.log('\n!! E2E ERROR:', e.message);
	await page.screenshot({ path: `${OUT}/error-${setId}.png` }).catch(() => {});
	process.exitCode = 1;
} finally {
	await browser.close();
}
