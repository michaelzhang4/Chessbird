/** Probe: the board must REJECT a wrong move and ACCEPT the right one. Uses the
 *  sample set's puzzle 1 (after setup Nf6, White plays Qxf7#; a wrong legal move is Ke2). */
import { chromium } from 'playwright';
const BASE = process.env.E2E_BASE || 'http://localhost:5173';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 430, height: 920 } });
page.on('dialog', (d) => d.accept());

async function clickSquare(sq) {
	const box = await page.locator('.cg-wrap').boundingBox();
	const s = box.width / 8;
	const f = sq.charCodeAt(0) - 97, r = Number(sq[1]); // white orientation
	await page.mouse.click(box.x + (f + 0.5) * s, box.y + (8 - r + 0.5) * s);
}
async function move(o, d) { await clickSquare(o); await page.waitForTimeout(150); await clickSquare(d); }

await page.goto(BASE + '/set/sample-tactics', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: /Skip assessment/ }).click();
await page.waitForTimeout(800);
await page.goto(BASE + '/solve', { waitUntil: 'networkidle' });
await page.locator('.cg-wrap').waitFor();
await page.waitForTimeout(900); // let the setup move auto-play

const before = await page.evaluate(() => document.body.innerText.match(/Cycle 1 · \d+\/\d+/)?.[0]);

// WRONG move: King e1->e2 (legal but not the solution)
await move('e1', 'e2');
await page.waitForTimeout(700);
const afterWrong = await page.evaluate(() => ({
	header: document.body.innerText.match(/Cycle 1 · \d+\/\d+/)?.[0],
	toast: document.body.innerText.match(/Not the move[^\n]*|Correct[^\n]*|Solved/)?.[0]
}));

// RIGHT move: Qh5xf7#
await move('h5', 'f7');
await page.waitForTimeout(1000);
const afterRight = await page.evaluate(() => ({
	header: document.body.innerText.match(/Cycle 1 · \d+\/\d+/)?.[0],
	toast: document.body.innerText.match(/Not the move[^\n]*|Correct[^\n]*|Solved/)?.[0]
}));
await page.screenshot({ path: 'verify-shots/07-probe.png' });

console.log('before:        ', before);
console.log('after WRONG:   ', JSON.stringify(afterWrong));
console.log('after RIGHT:   ', JSON.stringify(afterRight));
const ok = afterWrong.toast?.includes('Not the move') && /1\/5/.test(afterRight.header || '');
console.log('PROBE:', ok ? 'reject+accept behave correctly ✅' : 'unexpected ❌');
await browser.close();
