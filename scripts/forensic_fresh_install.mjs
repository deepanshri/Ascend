/**
 * Fresh-install RELEASE forensic measurements for Ascend.
 * Requires: RELEASE APK with WebView.setWebContentsDebuggingEnabled(true).
 *
 * Flow:
 *  1) pm clear + cold am start -W
 *  2) dismiss OS permission dialogs via adb
 *  3) CDP attach
 *  4) real signup attempt; if confirm-email, invoke onAuthSuccess(isNewUser=true) via React fiber
 *  5) measure onboarding → Home and first/second + → Create Habit
 */
import { spawn } from 'child_process';
import { createHash } from 'crypto';
import { readFileSync, statSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const ADB = 'C:\\Users\\deepa\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe';
const SERIAL = 'emulator-5554';
const CDP_PORT = 9223;
const PKG = 'com.ascend.habittracker';
const ACTIVITY = `${PKG}/.MainActivity`;
const APK = resolve('android/app/build/outputs/apk/release/app-release.apk');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function runAdb(args, timeoutMs = 60000) {
  return new Promise((resolvePromise, reject) => {
    const proc = spawn(ADB, ['-s', SERIAL, ...args], { windowsHide: true });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`adb timeout: ${args.join(' ')}\n${out}${err}`));
    }, timeoutMs);
    proc.stdout.on('data', (d) => (out += d.toString()));
    proc.stderr.on('data', (d) => (err += d.toString()));
    proc.on('close', (code) => {
      clearTimeout(timer);
      resolvePromise({ code, out, err });
    });
  });
}

async function dismissSystemDialogs() {
  for (let i = 0; i < 6; i++) {
    const dump = await runAdb(['exec-out', 'uiautomator', 'dump', '/dev/tty']);
    const xml = dump.out || '';
    const allow = xml.match(/text="Allow"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    const dont = xml.match(/text="Don.?t allow"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/i);
    const whileUsing = xml.match(
      /text="While using the app"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/i
    );
    const target = allow || whileUsing || dont;
    if (!target) break;
    const x = Math.floor((Number(target[1]) + Number(target[3])) / 2);
    const y = Math.floor((Number(target[2]) + Number(target[4])) / 2);
    await runAdb(['shell', 'input', 'tap', String(x), String(y)]);
    await sleep(400);
  }
  // If Settings was opened for alarms, leave it
  const focus = await runAdb(['shell', 'dumpsys', 'window']);
  if (/com\.android\.settings/i.test(focus.out)) {
    await runAdb(['shell', 'input', 'keyevent', '4']);
    await sleep(300);
    await runAdb(['shell', 'am', 'start', '-n', ACTIVITY]);
    await sleep(500);
  }
}

async function getCDPWebSocketUrl() {
  const targets = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`).then((r) => r.json());
  if (!Array.isArray(targets) || !targets.length) throw new Error('No CDP targets');
  const page = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl) || targets[0];
  return page.webSocketDebuggerUrl;
}

class CDPClient {
  constructor(ws) {
    this.ws = ws;
    this.id = 1;
    this.handlers = new Map();
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.handlers.has(msg.id)) {
        const { resolve, reject } = this.handlers.get(msg.id);
        this.handlers.delete(msg.id);
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
      }
    };
  }
  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const curId = this.id++;
      this.handlers.set(curId, { resolve, reject });
      this.ws.send(JSON.stringify({ id: curId, method, params }));
    });
  }
  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      throw new Error(JSON.stringify(res.exceptionDetails));
    }
    return res.result?.value;
  }
}

async function connectCDP(retries = 30) {
  for (let i = 0; i < retries; i++) {
    try {
      const wsUrl = await getCDPWebSocketUrl();
      const ws = new WebSocket(wsUrl);
      await new Promise((resolve, reject) => {
        ws.onopen = resolve;
        ws.onerror = reject;
      });
      return new CDPClient(ws);
    } catch {
      await sleep(400);
    }
  }
  throw new Error('CDP connect failed');
}

async function forwardDevtools() {
  const { out } = await runAdb(['shell', 'cat', '/proc/net/unix']);
  const match = out.match(/@(webview_devtools_remote_\d+)/);
  if (!match) throw new Error('webview_devtools_remote socket not found');
  await runAdb(['forward', '--remove', `tcp:${CDP_PORT}`]).catch(() => {});
  await runAdb(['forward', `tcp:${CDP_PORT}`, `localabstract:${match[1]}`]);
  return match[1];
}

async function waitEval(cdp, expression, { timeoutMs = 15000, intervalMs = 50 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const value = await cdp.eval(expression);
    if (value) return { ok: true, elapsedMs: Date.now() - start, value };
    await sleep(intervalMs);
  }
  return { ok: false, elapsedMs: Date.now() - start, value: null };
}

async function installPerfHooks(cdp) {
  await cdp.eval(`
    (function(){
      window.__PERF__ = { network: [], longTasks: [], marks: {} };
      try {
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) {
            window.__PERF__.longTasks.push({
              duration: Math.round(e.duration),
              start: Math.round(e.startTime),
            });
          }
        }).observe({ entryTypes: ['longtask'] });
      } catch {}
      if (!window.__FETCH_HOOKED__) {
        window.__FETCH_HOOKED__ = true;
        const orig = window.fetch.bind(window);
        window.fetch = async (...args) => {
          const t0 = performance.now();
          const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || 'unknown';
          try {
            const res = await orig(...args);
            window.__PERF__.network.push({
              url: String(url).split('?')[0],
              status: res.status,
              ms: Math.round(performance.now() - t0),
            });
            return res;
          } catch (e) {
            window.__PERF__.network.push({
              url: String(url).split('?')[0],
              status: 'error',
              ms: Math.round(performance.now() - t0),
            });
            throw e;
          }
        };
      }
      return true;
    })()
  `);
}

/** Drive AuthView's onAuthSuccess(isNewUser=true) when email confirm blocks the fresh-user path. */
async function forceNewUserViaReactFiber(cdp, email) {
  return cdp.eval(`
    (function(){
      const root = document.querySelector('#auth-screen') || document.getElementById('root');
      if (!root) return { ok:false, reason:'no-root' };
      const fiberKey = Object.keys(root).find((k) =>
        k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance')
      );
      if (!fiberKey) return { ok:false, reason:'no-fiber' };
      let fiber = root[fiberKey];
      let hops = 0;
      while (fiber && hops < 80) {
        const props = fiber.memoizedProps || fiber.pendingProps;
        if (props && typeof props.onAuthSuccess === 'function') {
          const session = {
            id: (crypto.randomUUID && crypto.randomUUID()) || ('usr_' + Date.now()),
            email: ${JSON.stringify(email)},
            name: 'Forensic Auditor',
            avatarUrl: '',
            isGuest: false,
            memberSince: 'Sep 2026',
            syncStatus: 'synced',
          };
          props.onAuthSuccess(session, true, ['Movies', 'Books', 'Anime', 'Running']);
          return { ok:true, sessionId: session.id };
        }
        fiber = fiber.return;
        hops++;
      }
      return { ok:false, reason:'onAuthSuccess-not-found', hops };
    })()
  `);
}

async function measurePlusTap(cdp, label) {
  await cdp.eval(`
    (function(){
      const overlay = document.querySelector('#add-habit-modal-overlay');
      if (overlay) {
        const btn = overlay.querySelector('button');
        if (btn) btn.click();
      }
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    })()
  `);
  await sleep(250);

  const blocked = await cdp.eval(`document.documentElement.classList.contains('driver-active')`);
  const t0 = Date.now();
  const perf0 = await cdp.eval(`performance.now()`);
  const clicked = await cdp.eval(`
    (function(){
      const btn = document.querySelector('#add-habit-btn-above-list');
      if (!btn) return { ok:false, reason:'missing' };
      const pe = getComputedStyle(btn).pointerEvents;
      const tClick = performance.now();
      btn.click();
      return {
        ok: true,
        pointerEvents: pe,
        driverActive: document.documentElement.classList.contains('driver-active'),
        tClick,
      };
    })()
  `);

  let visible = false;
  let latencyMs = null;
  let perfLatencyMs = null;
  for (let i = 0; i < 400; i++) {
    await sleep(25);
    const state = await cdp.eval(`
      (function(){
        const card = document.querySelector('#add-habit-modal-card');
        const overlay = document.querySelector('#add-habit-modal-overlay');
        const textHit = (document.body.innerText || '').includes('Create Habit');
        return {
          visible: Boolean(card || overlay || textHit),
          now: performance.now(),
        };
      })()
    `);
    if (state?.visible) {
      visible = true;
      latencyMs = Date.now() - t0;
      if (clicked?.tClick != null) perfLatencyMs = Math.round(state.now - clicked.tClick);
      break;
    }
  }

  return {
    label,
    clicked,
    blockedBeforeClick: blocked,
    modalVisible: visible,
    latencyMs,
    perfLatencyMs,
    wallMs: Date.now() - t0,
    baselinePerfMs: perf0,
  };
}

async function main() {
  const apkStat = statSync(APK);
  const apkSha = createHash('sha256').update(readFileSync(APK)).digest('hex').toUpperCase();

  const report = {
    apk: APK,
    apkBytes: apkStat.size,
    apkSha256: apkSha,
    apkMtime: apkStat.mtime.toISOString(),
    package: PKG,
    versionName: '1.0.5',
    buildType: 'release',
    measuredAt: new Date().toISOString(),
    serial: SERIAL,
  };

  console.log('=== ASCEND RELEASE FRESH-INSTALL FORENSIC ===\n');
  console.log(`APK: ${APK}`);
  console.log(`SHA256: ${apkSha}`);
  console.log(`Bytes: ${apkStat.size}\n`);

  await runAdb(['shell', 'am', 'force-stop', PKG]);
  await runAdb(['shell', 'pm', 'clear', PKG]);
  await runAdb(['shell', 'pm', 'grant', PKG, 'android.permission.POST_NOTIFICATIONS']).catch(() => {});
  await runAdb(['shell', 'appops', 'set', PKG, 'SCHEDULE_EXACT_ALARM', 'allow']).catch(() => {});

  console.log('[1] Cold launch (am start -S -W)...');
  const launch = await runAdb(['shell', 'am', 'start', '-S', '-W', '-n', ACTIVITY], 90000);
  console.log((launch.out || launch.err).trim());
  const totalMatch = (launch.out + launch.err).match(/TotalTime:\s*(\d+)/);
  const waitMatch = (launch.out + launch.err).match(/WaitTime:\s*(\d+)/);
  report.coldLaunchTotalTimeMs = totalMatch ? Number(totalMatch[1]) : null;
  report.coldLaunchWaitTimeMs = waitMatch ? Number(waitMatch[1]) : null;
  console.log(`-> TotalTime: ${report.coldLaunchTotalTimeMs} ms\n`);

  await sleep(1200);
  await dismissSystemDialogs();
  await sleep(800);

  const socket = await forwardDevtools();
  console.log(`CDP forwarded via ${socket}`);
  let cdp = await connectCDP();
  await installPerfHooks(cdp);

  const interactiveStart = Date.now();
  const authReady = await waitEval(
    cdp,
    `Boolean(document.querySelector('#auth-screen') || document.querySelector('#auth-submit-btn'))`,
    { timeoutMs: 20000 }
  );
  report.coldLaunchToAuthInteractiveMs = Date.now() - interactiveStart;
  report.authVisible = authReady.ok;
  report.authReadyPollMs = authReady.elapsedMs;
  console.log(
    `[2] Auth interactive: ${authReady.ok} (poll ${authReady.elapsedMs} ms, wall since dismiss ${report.coldLaunchToAuthInteractiveMs} ms)`
  );

  // Real signup attempt first
  await cdp.eval(`document.querySelector('#auth-tab-signup')?.click()`);
  await sleep(300);
  const email = `forensic_${Date.now()}@ascend.app`;
  await cdp.eval(`
    (function(){
      const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      function fill(el, v) {
        if (!el) return;
        set.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
      fill(document.querySelector('#auth-input-name'), 'Forensic Auditor');
      fill(document.querySelector('#auth-input-email'), ${JSON.stringify(email)});
      fill(document.querySelector('#auth-input-password'), 'AscendSecure2026!');
      document.querySelector('#auth-submit-btn')?.click();
      return true;
    })()
  `);
  console.log(`Signup submitted as ${email}`);

  const postSignup = await waitEval(
    cdp,
    `Boolean(
      document.querySelector('#onboarding-screen') ||
      document.querySelector('#onboarding-step1-next') ||
      (document.body.innerText || '').includes('Check your inbox')
    )`,
    { timeoutMs: 25000, intervalMs: 100 }
  );
  report.postSignupVisible = postSignup.ok;
  report.postSignupMs = postSignup.elapsedMs;

  const screenKind = await cdp.eval(`
    (function(){
      if (document.querySelector('#onboarding-screen') || document.querySelector('#onboarding-step1-next')) return 'onboarding';
      if ((document.body.innerText || '').includes('Check your inbox')) return 'confirm-email';
      if (document.querySelector('#auth-screen')) return 'auth';
      return 'unknown';
    })()
  `);
  report.authPath = screenKind;
  console.log(`[3] Post-signup screen: ${screenKind} in ${postSignup.elapsedMs} ms`);

  if (screenKind === 'confirm-email' || screenKind === 'auth') {
    const forced = await forceNewUserViaReactFiber(cdp, email);
    report.forcedNewUser = forced;
    console.log('[3b] Forced new-user via React fiber:', forced);
    if (!forced?.ok) throw new Error(`Could not enter new-user onboarding: ${JSON.stringify(forced)}`);
    await sleep(400);
  }

  const onboarding = await waitEval(
    cdp,
    `Boolean(document.querySelector('#onboarding-step1-next') || document.querySelector('#onboarding-screen'))`,
    { timeoutMs: 15000, intervalMs: 50 }
  );
  report.onboardingVisible = onboarding.ok;
  report.onboardingAppearMs = onboarding.elapsedMs;
  console.log(`[4] Onboarding visible: ${onboarding.ok} in ${onboarding.elapsedMs} ms`);
  if (!onboarding.ok) throw new Error('Onboarding never appeared');

  await cdp.eval(`document.querySelector('#onboarding-step1-next')?.click()`);
  await sleep(300);
  await cdp.eval(`document.querySelector('#onboarding-step2-next')?.click()`);
  await sleep(300);

  console.log('[5] Enter Ascend → Home...');
  const enterStart = Date.now();
  const enterPerf0 = await cdp.eval(`performance.now()`);
  await cdp.eval(`document.querySelector('#onboarding-finish-btn')?.click()`);
  const home = await waitEval(cdp, `Boolean(document.querySelector('#add-habit-btn-above-list'))`, {
    timeoutMs: 30000,
    intervalMs: 40,
  });
  const enterPerf1 = await cdp.eval(`performance.now()`);
  report.onboardingToHomeMs = home.ok ? Date.now() - enterStart : null;
  report.onboardingToHomePerfMs = home.ok ? Math.round(enterPerf1 - enterPerf0) : null;
  report.homeInteractive = home.ok;
  console.log(
    `-> Home interactive: ${home.ok} in ${report.onboardingToHomeMs} ms (perf ${report.onboardingToHomePerfMs} ms)`
  );
  if (!home.ok) throw new Error('Home never became interactive');

  // Driver.js starts ~700ms after home; sample during the critical window
  await sleep(900);
  report.driverState = await cdp.eval(`
    (function(){
      const btn = document.querySelector('#add-habit-btn-above-list');
      return {
        driverActive: document.documentElement.classList.contains('driver-active'),
        overlay: Boolean(document.querySelector('.driver-overlay')),
        popover: Boolean(document.querySelector('.driver-popover')),
        plusPointerEvents: btn ? getComputedStyle(btn).pointerEvents : 'missing',
        bodyPointerEvents: getComputedStyle(document.body).pointerEvents,
        htmlClass: document.documentElement.className,
      };
    })()
  `);
  console.log('[6] Driver state:', report.driverState);

  // Responsiveness probe: can we toggle a style on the + button within 100ms?
  report.responsivenessProbe = await cdp.eval(`
    (function(){
      const btn = document.querySelector('#add-habit-btn-above-list');
      if (!btn) return { ok:false };
      const t0 = performance.now();
      btn.style.outline = '1px solid red';
      const t1 = performance.now();
      btn.style.outline = '';
      return { ok:true, styleMutateMs: Math.round((t1 - t0) * 100) / 100 };
    })()
  `);

  report.firstPlusTap = await measurePlusTap(cdp, 'first');
  console.log('[7] First + tap:', report.firstPlusTap);

  await sleep(400);
  report.secondPlusTap = await measurePlusTap(cdp, 'second');
  console.log('[8] Second + tap:', report.secondPlusTap);

  report.perfSnapshot = await cdp.eval(`
    (function(){
      const p = window.__PERF__ || { network: [], longTasks: [] };
      const long = (p.longTasks || []).slice().sort((a, b) => b.duration - a.duration).slice(0, 15);
      const net = (p.network || []);
      const slowNet = net.slice().sort((a, b) => b.ms - a.ms).slice(0, 15);
      return {
        longTaskCount: (p.longTasks || []).length,
        worstLongTasksMs: long,
        networkCount: net.length,
        slowestNetwork: slowNet,
        networkSample: net.slice(0, 25),
      };
    })()
  `);
  console.log('[9] Perf snapshot:', JSON.stringify(report.perfSnapshot, null, 2));

  const logcat = await runAdb(['logcat', '-d', '-t', '300', '*:E']);
  report.logcatErrors = (logcat.out || '')
    .split('\n')
    .filter((l) => /ascend|habittracker|chromium|capacitor|FATAL|AndroidRuntime/i.test(l))
    .slice(-40);

  // Verdict helpers
  const freezeThresholdMs = 5000;
  const first = report.firstPlusTap?.latencyMs;
  const second = report.secondPlusTap?.latencyMs;
  report.originalBugFixed =
    report.homeInteractive === true &&
    report.firstPlusTap?.modalVisible === true &&
    typeof first === 'number' &&
    first < freezeThresholdMs &&
    report.secondPlusTap?.modalVisible === true &&
    typeof second === 'number' &&
    second < freezeThresholdMs;

  const outPath = resolve('scripts/forensic_report.json');
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\n=== JSON REPORT (${outPath}) ===`);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error('FORENSIC FAILED:', err);
  process.exit(1);
});
