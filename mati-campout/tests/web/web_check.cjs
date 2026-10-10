// MATI's Campout - browser check of the web export (Playwright + Chromium).
//
//   tools/export_web.sh --no-copy
//   NODE_PATH=$(npm root -g) node tests/web/web_check.cjs [--only=desktop|phone|visibility] [--port=8061]
//
// Serves build/web with python's http.server, then drives it in headless
// Chromium with SwiftShader WebGL 2 (slow: a few frames per second):
//   desktop  1280x720: boot screen, tap to start, title, Play (keyboard),
//            the world loads, walking with W works.
//   phone    iPhone 14 landscape (844x390 @2x, touch, mobile UA): boot,
//            title by tap, touch controls visible, joystick drag moves the
//            player, look drag turns the camera, joystick + look together
//            (multi-touch), USE swings the axe, tapping a hotbar slot selects
//            it, portrait shows the "turn sideways" card and pauses.
// Screenshots go to tests/output/web/*.png; prints PASS/FAIL lines, console
// errors and timings, and exits non-zero on failures.
// The game publishes window.matiState (JSON) when window.matiDebug is set.
'use strict';
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..', '..');
const BUILD = process.env.WEB_BUILD || path.join(ROOT, 'build', 'web');
const OUT = path.join(ROOT, 'tests', 'output', 'web');
const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
	const m = a.replace(/^--/, '').split('=');
	return [m[0], m.length > 1 ? m[1] : true];
}));
const PORT = Number(argv.port || 8061);
const URL = `http://127.0.0.1:${PORT}/index.html`;
const GL_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
	'--autoplay-policy=no-user-gesture-required'];
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

let passes = 0;
let failures = 0;
const report = { timings: {}, console: {}, states: {} };

function check(cond, what) {
	if (cond) {
		passes++;
		console.log('PASS ' + what);
	} else {
		failures++;
		console.log('FAIL ' + what);
	}
	return cond;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Wasm heap + JS heap of the page in MB (Chromium only).
async function memory(page) {
	try {
		return await page.evaluate(() => ({
			wasm_mb: Math.round((window.matiWasmBytes ? window.matiWasmBytes() : 0) / 1048576),
			js_heap_mb: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1,
		}));
	} catch (e) {
		return null;
	}
}

async function state(page) {
	try {
		const s = await page.evaluate(() => (window.matiState ? window.matiState : null));
		return s ? JSON.parse(s) : null;
	} catch (e) {
		return null;
	}
}

async function waitState(page, pred, timeoutMs, label) {
	const t0 = Date.now();
	let last = null;
	while (Date.now() - t0 < timeoutMs) {
		last = await state(page);
		if (last && pred(last)) {
			return last;
		}
		await sleep(500);
	}
	console.log(`  (timeout waiting for ${label}; last state: ${JSON.stringify(last && { screen: last.screen, playing: last.playing, state: last.state })})`);
	return null;
}

function watchConsole(page, key) {
	const logs = [];
	report.console[key] = logs;
	page.on('console', (m) => {
		const t = m.type();
		const text = m.text();
		if (t === 'error' || t === 'warning' || /ERROR|SCRIPT ERROR|WARNING/.test(text)) {
			logs.push(`[${t}] ${text}`);
		}
		if (/MATI web:/.test(text)) {
			console.log('  ' + text);
		}
	});
	page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
	return logs;
}

async function boot(page, key, tapStart) {
	const t0 = Date.now();
	await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
	await page.waitForSelector('#start.show', { timeout: 240000 });
	report.timings[key + '_download_and_compile_s'] = (Date.now() - t0) / 1000;
	await page.screenshot({ timeout: 240000, path: path.join(OUT, key + '_boot.png') });
	await tapStart();
	const st = await waitState(page, (s) => /title_screen/.test(s.screen || ''), 240000, 'title screen');
	report.timings[key + '_start_to_title_s'] = (Date.now() - t0) / 1000;
	check(!!st, `${key}: boots to the title screen`);
	// The boot overlay fades out once the game reports in.
	await page.waitForFunction(() => !document.getElementById('boot'), null, { timeout: 30000 }).catch(() => {});
	await sleep(1500);
	await page.screenshot({ timeout: 240000, path: path.join(OUT, key + '_title.png') });
	return st;
}

async function desktop(browser) {
	console.log('== desktop 1280x720');
	const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
	await ctx.addInitScript(() => { window.matiDebug = true; });
	const page = await ctx.newPage();
	const logs = watchConsole(page, 'desktop');
	const st0 = await boot(page, 'desktop', async () => { await page.click('#start', { force: true, noWaitAfter: true, timeout: 120000 }); });
	if (!st0) {
		await ctx.close();
		return;
	}
	check(st0.renderer === 'gl_compatibility', `desktop: Compatibility renderer (${st0.renderer})`);
	check(st0.touch === false, 'desktop: no touch controls');
	check(st0.quality === 'low', `desktop browser defaults to low quality (${st0.quality})`);
	const t0 = Date.now();
	await page.keyboard.press('Enter');
	const st = await waitState(page, (s) => s.playing && s.player, 600000, 'world');
	report.timings.desktop_world_load_s = (Date.now() - t0) / 1000;
	check(!!st, 'desktop: Play loads the world');
	if (st) {
		await sleep(4000);
		await page.screenshot({ timeout: 240000, path: path.join(OUT, 'desktop_game.png') });
		const sv = await state(page);
		check(sv.pitch < 0.3, `desktop: camera starts behind the player, not flung at the sky (pitch ${sv.pitch})`);
		const p0 = sv.player;
		await page.keyboard.down('KeyW');
		await sleep(4000);
		await page.keyboard.up('KeyW');
		await sleep(500);
		const s2 = await state(page);
		const d = Math.hypot(s2.player[0] - p0[0], s2.player[2] - p0[2]);
		check(d > 0.3, `desktop: W walks forward (${d.toFixed(2)} m)`);
		report.states.desktop = s2;
		report.timings.desktop_fps = s2.fps;
		report.memory = report.memory || {};
		report.memory.desktop = Object.assign({ godot_static_mb: s2.mem_mb }, await memory(page));
	}
	check(!logs.some((l) => /SCRIPT ERROR|pageerror/.test(l)), 'desktop: no script errors in the console');
	await ctx.close();
}

// Hidden tab -> paused, visible again -> resumes (boots to the title only).
async function visibility(browser) {
	console.log('== hidden tab pauses the game');
	const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
	await ctx.addInitScript(() => { window.matiDebug = true; });
	const page = await ctx.newPage();
	watchConsole(page, 'visibility');
	const st0 = await boot(page, 'visibility', async () => { await page.click('#start', { force: true, noWaitAfter: true, timeout: 120000 }); });
	if (st0) {
		const setHidden = (h) => page.evaluate((hid) => {
			Object.defineProperty(document, 'hidden', { value: hid, configurable: true });
			Object.defineProperty(document, 'visibilityState', { value: hid ? 'hidden' : 'visible', configurable: true });
			document.dispatchEvent(new Event('visibilitychange'));
		}, h);
		await setHidden(true);
		const p = await waitState(page, (s) => s.paused === true, 20000, 'paused while hidden');
		check(!!p, 'hidden tab pauses the game');
		await setHidden(false);
		const r = await waitState(page, (s) => s.paused === false, 20000, 'resumed');
		check(!!r, 'visible again resumes');
	}
	await ctx.close();
}

async function touchEvent(cdp, type, points) {
	await cdp.send('Input.dispatchTouchEvent', {
		type,
		touchPoints: points.map((p) => ({ x: p.x, y: p.y, id: p.id, radiusX: 8, radiusY: 8, force: 1 })),
	});
}

function center(rect, dpr) {
	return { x: (rect[0] + rect[2] / 2) / dpr, y: (rect[1] + rect[3] / 2) / dpr };
}

async function phone(browser) {
	console.log('== phone: iPhone 14 landscape 844x390 @2x (touch, mobile UA)');
	const dpr = 2;
	const ctx = await browser.newContext({
		viewport: { width: 844, height: 390 }, deviceScaleFactor: dpr, isMobile: true, hasTouch: true, userAgent: IPHONE_UA,
	});
	await ctx.addInitScript(() => { window.matiDebug = true; });
	const page = await ctx.newPage();
	const logs = watchConsole(page, 'phone');
	const cdp = await ctx.newCDPSession(page);
	const st0 = await boot(page, 'phone', async () => { await page.tap('#start', { force: true, noWaitAfter: true, timeout: 120000 }); });
	if (!st0) {
		await ctx.close();
		return;
	}
	check(st0.touch === true && st0.touch_device === true, 'phone: touch mode detected');
	check(st0.quality === 'phone', `phone: phone quality preset picked automatically (${st0.quality})`);
	check(st0.renderer === 'gl_compatibility', 'phone: Compatibility renderer');
	report.states.phone_title = st0;
	// Tap Play on the title screen.
	check(!!(st0.ui && st0.ui.play), 'phone: Play button reported');
	const t0 = Date.now();
	const pp = center(st0.ui.play, dpr);
	await page.touchscreen.tap(pp.x, pp.y);
	let st = await waitState(page, (s) => s.playing && s.player && s.ui && s.ui.use, 600000, 'world (phone)');
	report.timings.phone_world_load_s = (Date.now() - t0) / 1000;
	if (!check(!!st, 'phone: tapping Play loads the world')) {
		await page.screenshot({ timeout: 240000, path: path.join(OUT, 'phone_fail.png') });
		await ctx.close();
		return;
	}
	await sleep(5000);
	st = await state(page);
	check(st.touch_visible === true, 'phone: touch controls visible');
	await page.screenshot({ timeout: 240000, path: path.join(OUT, 'phone_game.png') });

	// --- Joystick: left thumb drags up (forward) and holds.
	const js = { x: st.ui.joy_rest[0] / dpr, y: st.ui.joy_rest[1] / dpr };
	const p0 = st.player;
	await touchEvent(cdp, 'touchStart', [{ id: 1, x: js.x, y: js.y }]);
	for (let i = 1; i <= 6; i++) {
		await touchEvent(cdp, 'touchMove', [{ id: 1, x: js.x + 4 * i, y: js.y - 9 * i }]);
		await sleep(120);
	}
	await sleep(2500);
	await page.screenshot({ timeout: 240000, path: path.join(OUT, 'phone_joystick.png') });
	await sleep(2500);
	await touchEvent(cdp, 'touchEnd', []);
	await sleep(800);
	let s2 = await state(page);
	const moved = Math.hypot(s2.player[0] - p0[0], s2.player[2] - p0[2]);
	check(moved > 0.5, `phone: joystick drag moves the player (${moved.toFixed(2)} m)`);

	// --- Look: drag on the right side turns the camera.
	const yaw0 = s2.yaw;
	const lx = 844 * 0.62;
	const ly = 390 * 0.42;
	await touchEvent(cdp, 'touchStart', [{ id: 2, x: lx, y: ly }]);
	for (let i = 1; i <= 8; i++) {
		await touchEvent(cdp, 'touchMove', [{ id: 2, x: lx - 15 * i, y: ly }]);
		await sleep(80);
	}
	await touchEvent(cdp, 'touchEnd', []);
	await sleep(800);
	s2 = await state(page);
	check(Math.abs(s2.yaw - yaw0) > 0.15, `phone: look drag turns the camera (yaw ${yaw0} -> ${s2.yaw})`);

	// --- Multi-touch: move and look at the same time.
	const p1 = s2.player;
	const yaw1 = s2.yaw;
	await touchEvent(cdp, 'touchStart', [{ id: 3, x: js.x, y: js.y }]);
	await touchEvent(cdp, 'touchStart', [{ id: 3, x: js.x, y: js.y }, { id: 4, x: lx, y: ly }]);
	for (let i = 1; i <= 8; i++) {
		await touchEvent(cdp, 'touchMove', [{ id: 3, x: js.x, y: js.y - 7 * i }, { id: 4, x: lx + 12 * i, y: ly }]);
		await sleep(150);
	}
	await sleep(3000);
	await touchEvent(cdp, 'touchEnd', [{ id: 4, x: lx + 96, y: ly }]);
	await touchEvent(cdp, 'touchEnd', []);
	await sleep(800);
	s2 = await state(page);
	const moved2 = Math.hypot(s2.player[0] - p1[0], s2.player[2] - p1[2]);
	check(moved2 > 0.3 && Math.abs(s2.yaw - yaw1) > 0.1,
		`phone: joystick + look together (moved ${moved2.toFixed(2)} m, yaw ${yaw1} -> ${s2.yaw})`);

	// --- USE swings the axe (slot 1 = rusty axe).
	s2 = await state(page);
	const swings0 = s2.swings;
	const up = center(s2.ui.use, dpr);
	await page.touchscreen.tap(up.x, up.y);
	const sw = await waitState(page, (s) => s.swings > swings0, 15000, 'a swing');
	check(!!sw, `phone: tapping USE swings the axe (${sw ? sw.selected_item : 'no swing'})`);
	await page.screenshot({ timeout: 240000, path: path.join(OUT, 'phone_use.png') });

	// --- Tapping hotbar slot 2 selects it.
	s2 = await state(page);
	const sp = center(s2.ui.slot_2, dpr);
	await page.touchscreen.tap(sp.x, sp.y);
	const sel = await waitState(page, (s) => s.selected_slot === 1, 6000, 'slot 2 selected');
	check(!!sel, `phone: tapping hotbar slot 2 selects it (${sel ? sel.selected_item : 'no'})`);
	await sleep(1500);
	await page.screenshot({ timeout: 240000, path: path.join(OUT, 'phone_slot.png') });

	// --- RUN toggles and lights up.
	s2 = await state(page);
	const rp = center(s2.ui.run, dpr);
	await page.touchscreen.tap(rp.x, rp.y);
	const run = await waitState(page, (s) => s.sprint === true, 5000, 'sprint on');
	check(!!run, 'phone: RUN button toggles running');

	// --- Pause button opens the pause menu, Resume by tapping the X.
	s2 = await state(page);
	if (s2.ui.pause) {
		const pz = center(s2.ui.pause, dpr);
		await page.touchscreen.tap(pz.x, pz.y);
		const pm = await waitState(page, (s) => s.modal === 'pause', 6000, 'pause menu');
		check(!!pm, 'phone: Pause button opens the pause menu');
		await sleep(1200);
		await page.screenshot({ timeout: 240000, path: path.join(OUT, 'phone_pause.png') });
		// A key press (e.g. a Bluetooth keyboard) switches to keyboard mode...
		await page.keyboard.press('Escape');
		const kb = await waitState(page, (s) => s.modal === '' && s.touch === false, 8000, 'pause closed by Esc');
		check(!!kb, 'phone: Esc closes the menu and switches to keyboard mode');
		// ...and the next touch brings the touch controls back.
		await page.touchscreen.tap(844 * 0.5, 390 * 0.45);
		const back = await waitState(page, (s) => s.touch === true && s.touch_visible === true, 10000, 'touch mode again');
		check(!!back, 'phone: a touch brings the touch controls back');
	}

	// --- Portrait shows the rotate card and pauses; landscape resumes.
	await page.setViewportSize({ width: 390, height: 844 });
	const pr = await waitState(page, (s) => s.portrait === true && s.paused === true, 20000, 'portrait card');
	check(!!pr, 'phone: portrait shows the rotate card and pauses');
	await sleep(1500);
	await page.screenshot({ timeout: 240000, path: path.join(OUT, 'phone_portrait.png') });
	await page.setViewportSize({ width: 844, height: 390 });
	const back = await waitState(page, (s) => s.portrait === false && s.paused === false, 20000, 'landscape again');
	check(!!back, 'phone: landscape again resumes the game');
	await sleep(2000);
	await page.screenshot({ timeout: 240000, path: path.join(OUT, 'phone_back.png') });
	report.states.phone = await state(page);
	report.timings.phone_fps = report.states.phone ? report.states.phone.fps : -1;
	report.memory = report.memory || {};
	report.memory.phone = Object.assign({ godot_static_mb: report.states.phone ? report.states.phone.mem_mb : -1 }, await memory(page));
	check(!logs.some((l) => /SCRIPT ERROR|pageerror/.test(l)), 'phone: no script errors in the console');
	await ctx.close();
}

(async () => {
	fs.mkdirSync(OUT, { recursive: true });
	if (!fs.existsSync(path.join(BUILD, 'index.html'))) {
		console.log('No web build at ' + BUILD + ' (run tools/export_web.sh first)');
		process.exit(2);
	}
	const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1', '--directory', BUILD], { stdio: 'ignore' });
	await sleep(1200);
	const browser = await chromium.launch({ headless: true, args: GL_ARGS });
	const run = async (name, fn) => {
		try {
			await fn(browser);
		} catch (e) {
			failures++;
			console.log(`FAIL ${name} exception: ` + (e && e.stack ? e.stack : e));
		}
	};
	try {
		if (!argv.only || argv.only === 'desktop') {
			await run('desktop', desktop);
		}
		if (!argv.only || argv.only === 'phone') {
			await run('phone', phone);
		}
		if (!argv.only || argv.only === 'visibility') {
			await run('visibility', visibility);
		}
	} finally {
		await browser.close();
		server.kill();
	}
	fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
	for (const k of Object.keys(report.console)) {
		const l = report.console[k];
		console.log(`-- console ${k}: ${l.length} warnings/errors`);
		for (const line of [...new Set(l)].slice(0, 30)) {
			console.log('   ' + line.slice(0, 300));
		}
	}
	console.log('-- timings ' + JSON.stringify(report.timings));
	console.log('-- memory ' + JSON.stringify(report.memory || {}));
	console.log(`WEB CHECK: ${passes} passed, ${failures} failed`);
	process.exit(failures > 0 ? 1 : 0);
})();
