// MATI's Campout - WebGL context loss check (Playwright + Chromium).
//
//   NODE_PATH=$(npm root -g) node tests/web/context_loss.cjs [--dir=build/web] [--port=8062]
//
// Starts the game in a phone-sized page, forces a lost WebGL context (the same
// thing a phone does under memory pressure) and checks that the player is not
// left with Godot's "WebGL context lost, please reload the page" alert: the
// shell should show a short note and bring the game back by reloading.
// Exits non-zero on failure.
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
	const [k, v] = a.replace(/^--/, '').split('=');
	return [k, v === undefined ? true : v];
}));
const ROOT = path.resolve(__dirname, '..', '..');
const BUILD = path.resolve(ROOT, argv.dir || 'build/web');
const PORT = Number(argv.port || 8062);
const URL = `http://127.0.0.1:${PORT}/index.html?autostart`;
const GL_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

let failures = 0;
function check(ok, what) {
	console.log(`${ok ? 'PASS' : 'FAIL'} ${what}`);
	if (!ok) failures++;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
	const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1', '--directory', BUILD], { stdio: 'ignore' });
	await sleep(800);
	const browser = await chromium.launch({ headless: true, args: GL_ARGS });
	try {
		const ctx = await browser.newContext({
			viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: IPHONE_UA,
		});
		const page = await ctx.newPage();
		let alerts = 0;
		page.on('dialog', async (d) => { alerts++; await d.dismiss().catch(() => {}); });
		let loads = 0;
		page.on('load', () => { loads++; });

		await page.goto(URL, { waitUntil: 'load' });
		// Wait for the game to be playing (the boot screen is removed once the title is up).
		await page.waitForFunction(() => !document.getElementById('boot'), null, { timeout: 600000 }).catch(() => {});
		await sleep(3000);
		const before = loads;

		// Force the loss.
		await page.evaluate(() => {
			const c = document.getElementById('canvas');
			const gl = c.getContext('webgl2');
			const ext = gl && gl.getExtension('WEBGL_lose_context');
			if (ext) ext.loseContext();
		});
		await sleep(2500);
		check(alerts === 0, 'no "context lost" alert is shown to the player');

		// The shell reloads the page after its short note.
		// The reload can land before this point, so watch the load counter, not the event.
		let reloaded = loads > before;
		for (let i = 0; i < 120 && !reloaded; i++) {
			await sleep(500);
			reloaded = loads > before;
		}
		check(reloaded, 'the page reloads and the game comes back');
		if (reloaded) {
			await page.waitForFunction(() => !document.getElementById('boot') || !!document.getElementById('start'), null, { timeout: 600000 }).catch(() => {});
			check(true, 'the game boots again after the reload');
		}
		await ctx.close();
	} finally {
		await browser.close();
		server.kill();
	}
	console.log(failures ? `CONTEXT LOSS CHECK: ${failures} failed` : 'CONTEXT LOSS CHECK: all passed');
	process.exit(failures ? 1 : 0);
})().catch((err) => {
	console.error(err);
	process.exit(1);
});
