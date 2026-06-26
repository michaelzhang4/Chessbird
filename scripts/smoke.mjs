/** Headless smoke test against the running preview server (http://localhost:4173). */
import { chromium } from 'playwright';

const BASE = process.env.SMOKE_BASE || 'http://localhost:4173';
const errors = [];
const failures = [];
const ok = (cond, msg) => (cond ? console.log('  ✓', msg) : (failures.push(msg), console.log('  ✗', msg)));

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', (m) => {
	if (m.type() === 'error') {
		errors.push('console: ' + m.text());
		console.log('   ! console:', m.text());
	}
});
page.on('pageerror', (e) => {
	errors.push('pageerror: ' + e.message);
	console.log('   ! pageerror:', e.name, '::', e.message, '::', String(e));
	if (e.stack) console.log(e.stack);
});
page.on('dialog', (d) => {
	console.log('   · dialog:', d.message());
	d.accept();
});

async function dump(where) {
	console.log(`\n--- diagnostics @ ${where} ---`);
	console.log('url:', page.url());
	const btns = await page.locator('button, a').allInnerTexts();
	console.log('clickables:', JSON.stringify(btns));
}

// 1. Home boots
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('h1:has-text("Woodpecker")', { timeout: 15000 });
ok(true, 'home screen renders');

// 2. Set preview renders a real board
await page.goto(`${BASE}/set/sample-tactics`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('cg-board piece', { timeout: 15000 });
ok((await page.locator('cg-board').count()) > 0, 'set preview board renders with pieces');

// 3. Start a program (Dexie write) -> dashboard
await page.click('text=Skip assessment & start now');
try {
	await page.waitForURL('**/program', { timeout: 12000 });
} catch {
	await dump('after skip-assessment click');
	throw new Error('did not navigate to /program');
}
await page.waitForSelector('text=Cycle 1', { timeout: 15000 });
ok(true, 'program created -> dashboard shows Cycle 1');

// 4. Enter the solve screen
await page.click("text=Start today's puzzles");
await page.waitForURL('**/solve', { timeout: 15000 });
await page.waitForSelector('cg-board piece', { timeout: 15000 });
await page.waitForTimeout(1100); // let the auto setup move animate
ok((await page.locator('cg-board').count()) > 0, 'solve board renders');

// 5. Solve Scholar's mate (white): Qh5 x f7. Board is white-oriented.
const box = await page.locator('cg-board').boundingBox();
const sq = box.width / 8;
const cell = (file, rank) => ({ x: box.x + (file + 0.5) * sq, y: box.y + (8 - rank + 0.5) * sq });
const from = cell(7, 5); // h5
const to = cell(5, 7); // f7
await page.mouse.click(from.x, from.y);
await page.waitForTimeout(200);
await page.mouse.click(to.x, to.y);
await page.waitForTimeout(900);
const advanced =
	(await page.locator('text=Correct').count()) > 0 ||
	(await page.locator('text=/Today \\d+\\//').count()) > 0;
ok(advanced, 'first puzzle solved via board interaction (Qxf7#)');

await browser.close();

console.log(`\nconsole/page errors: ${errors.length}`);
errors.forEach((e) => console.log('   !', e));
if (failures.length || errors.length) {
	console.error(`\nSMOKE FAILED (${failures.length} assertion, ${errors.length} runtime)`);
	process.exit(1);
}
console.log('\n✅ SMOKE PASSED');
