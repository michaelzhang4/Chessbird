/** End-to-end GUI verification with Playwright. Drives the real app in Chromium. */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.E2E_BASE || 'http://localhost:5173';
const OUT = 'verify-shots';
mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log('•', ...a);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 430, height: 920 } });
page.on('dialog', (d) => d.accept()); // auto-accept "set aside current program?"
page.on('pageerror', (e) => console.log('!! pageerror:', e.message));

/** Click a board square by algebraic name, accounting for orientation. */
async function clickSquare(sq, orientation) {
	const box = await page.locator('.cg-wrap').boundingBox();
	const s = box.width / 8;
	const file = sq.charCodeAt(0) - 97; // a=0
	const rank = Number(sq[1]); // 1..8
	let cx, cy;
	if (orientation === 'w') {
		cx = box.x + (file + 0.5) * s;
		cy = box.y + (8 - rank + 0.5) * s;
	} else {
		cx = box.x + (7 - file + 0.5) * s;
		cy = box.y + (rank - 1 + 0.5) * s;
	}
	await page.mouse.click(cx, cy);
}
async function move(orig, dest, orientation) {
	await clickSquare(orig, orientation);
	await page.waitForTimeout(150);
	await clickSquare(dest, orientation);
}

const results = [];
try {
	// 1) HOME
	await page.goto(BASE + '/', { waitUntil: 'networkidle' });
	await page.getByText('Library', { exact: false }).first().waitFor();
	const libCount = await page.locator('a[href*="/set/"]').count();
	await page.screenshot({ path: `${OUT}/01-home.png` });
	results.push(`HOME: rendered, ${libCount} set cards visible`);

	// 2) POOL: select all, read unique count, sample 8, create
	await page.getByText('Build a training pool').click();
	await page.waitForURL('**/pool**');
	await page.getByText('Select all').click();
	await page.waitForFunction(() => !document.body.innerText.includes('Counting'), { timeout: 15000 });
	await page.waitForTimeout(400);
	const summary = await page.evaluate(() => {
		const m = document.body.innerText.match(/([\d,]+)\s+unique puzzles(?:\s*\(([\d,]+)\s+dupes merged\))?/);
		return m ? { unique: m[1], dupes: m[2] || '0' } : null;
	});
	results.push(`POOL: select-all → ${summary?.unique} unique puzzles (${summary?.dupes} dupes merged)`);
	await page.screenshot({ path: `${OUT}/02-pool.png` });

	// set count to 8 and create
	await page.locator('input[type="number"]').fill('8');
	await page.getByRole('button', { name: /Create pool/ }).click();
	await page.waitForURL('**/set/**', { timeout: 15000 });
	await page.waitForTimeout(600);
	const setPageText = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 200));
	await page.screenshot({ path: `${OUT}/03-pool-set.png` });
	results.push(`POOL CREATE: landed on set page → "${setPageText.slice(0, 120)}"`);

	// 3) SOLVE a KNOWN imported study puzzle (Woodpecker 1-25 #1)
	await page.goto(BASE + '/set/the-woodpecker-method-1-25', { waitUntil: 'networkidle' });
	await page.getByRole('button', { name: /Skip assessment/ }).click();
	await page.waitForTimeout(800);
	await page.goto(BASE + '/solve', { waitUntil: 'networkidle' });
	await page.locator('.cg-wrap').waitFor();
	await page.waitForTimeout(600);
	const toMove = await page.evaluate(() => document.body.innerText.match(/(White|Black) to move/)?.[0]);
	const headerBefore = await page.evaluate(() => document.body.innerText.match(/Cycle 1 · \d+\/\d+/)?.[0]);
	await page.screenshot({ path: `${OUT}/04-solve-before.png` });
	results.push(`SOLVE: loaded puzzle 1 → "${toMove}", header "${headerBefore}"`);

	// Play Rxh2+ (h8h2), engine auto-replies Kxh2, then Rh8# (a8h8). Board oriented black.
	await move('h8', 'h2', 'b');
	await page.waitForTimeout(1100); // wait for auto-reply + re-enable
	await move('a8', 'h8', 'b');
	await page.waitForTimeout(1200);
	const afterText = await page.evaluate(() => document.body.innerText);
	const solvedHeader = afterText.match(/Cycle 1 · (\d+)\/(\d+)/);
	const toast = afterText.match(/Correct[^\n]*|Solved|Not the move/)?.[0];
	await page.screenshot({ path: `${OUT}/05-solve-after.png` });
	results.push(`SOLVE RESULT: header now "${solvedHeader?.[0]}", toast "${toast || '(none)'}"`);
	const solvedCount = solvedHeader ? Number(solvedHeader[1]) : 0;

	// 4) STATS
	await page.goto(BASE + '/stats', { waitUntil: 'networkidle' });
	await page.waitForTimeout(600);
	const statsText = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 240));
	await page.screenshot({ path: `${OUT}/06-stats.png` });
	results.push(`STATS: "${statsText.slice(0, 160)}"`);

	console.log('\n===== E2E RESULTS =====');
	results.forEach((r) => log(r));
	console.log('\nVERDICT:', solvedCount >= 1 ? 'SOLVE ACCEPTED ✅' : 'SOLVE NOT REGISTERED ❌');
} catch (e) {
	console.log('\n!! E2E ERROR:', e.message);
	await page.screenshot({ path: `${OUT}/error.png` }).catch(() => {});
	results.forEach((r) => log(r));
	process.exitCode = 1;
} finally {
	await browser.close();
}
