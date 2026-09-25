/**
 * Fresh install: measure how long Driver.js locks #add-habit-btn-above-list,
 * then ADB-tap + when pointer-events become auto.
 */
import { spawn } from 'child_process';

const ADB = 'C:\\Users\\deepa\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe';
const SERIAL = 'emulator-5554';
const CDP_PORT = 9223;
const PKG = 'com.ascend.habittracker';
const ACTIVITY = `${PKG}/.MainActivity`;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function runAdb(args, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ADB, ['-s', SERIAL, ...args], { windowsHide: true });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`adb timeout`));
    }, timeoutMs);
    proc.stdout.on('data', (d) => (out += d.toString()));
    proc.stderr.on('data', (d) => (err += d.toString()));
    proc.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, out, err });
    });
  });
}

async function connect() {
  const { out } = await runAdb(['shell', 'cat', '/proc/net/unix']);
  const match = out.match(/@(webview_devtools_remote_\d+)/);
  if (!match) throw new Error('no socket');
  await runAdb(['forward', '--remove', `tcp:${CDP_PORT}`]).catch(() => {});
  await runAdb(['forward', `tcp:${CDP_PORT}`, `localabstract:${match[1]}`]);
  const targets = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`).then((r) => r.json());
  const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
  await new Promise((r, j) => {
    ws.onopen = r;
    ws.onerror = j;
  });
  let id = 1;
  const evalExpr = (expression) =>
    new Promise((resolve, reject) => {
      const cur = id++;
      const timer = setTimeout(() => reject(new Error('eval timeout')), 20000);
      const h = (ev) => {
        const d = JSON.parse(ev.data);
        if (d.id === cur) {
          clearTimeout(timer);
          ws.removeEventListener('message', h);
          if (d.error) reject(new Error(JSON.stringify(d.error)));
          else if (d.result?.exceptionDetails)
            reject(new Error(JSON.stringify(d.result.exceptionDetails)));
          else resolve(d.result?.result?.value);
        }
      };
      ws.addEventListener('message', h);
      ws.send(
        JSON.stringify({
          id: cur,
          method: 'Runtime.evaluate',
          params: { expression, returnByValue: true, awaitPromise: true },
        })
      );
    });
  return { ws, evalExpr };
}

async function waitEval(evalExpr, expression, timeoutMs = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const v = await evalExpr(expression);
    if (v) return { ok: true, ms: Date.now() - t0, v };
    await sleep(40);
  }
  return { ok: false, ms: Date.now() - t0, v: null };
}

async function main() {
  await runAdb(['shell', 'am', 'force-stop', PKG]);
  await runAdb(['shell', 'pm', 'clear', PKG]);
  await runAdb(['shell', 'pm', 'grant', PKG, 'android.permission.POST_NOTIFICATIONS']).catch(() => {});
  const launch = await runAdb(['shell', 'am', 'start', '-S', '-W', '-n', ACTIVITY], 90000);
  console.log(launch.out.trim());
  await sleep(1500);
  // dismiss allow
  for (let i = 0; i < 4; i++) {
    await runAdb(['shell', 'input', 'tap', '540', '1340']);
    await sleep(350);
  }

  let { ws, evalExpr } = await connect();

  await waitEval(evalExpr, `Boolean(document.querySelector('#auth-tab-signup'))`);
  await evalExpr(`document.querySelector('#auth-tab-signup')?.click()`);
  await sleep(250);
  const email = `forensic_tap_${Date.now()}@ascend.app`;
  await evalExpr(`
    (function(){
      const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
      const fill=(el,v)=>{ if(!el) return; set.call(el,v); el.dispatchEvent(new Event('input',{bubbles:true})); };
      fill(document.querySelector('#auth-input-name'),'Forensic');
      fill(document.querySelector('#auth-input-email'), ${JSON.stringify(email)});
      fill(document.querySelector('#auth-input-password'),'AscendSecure2026!');
      document.querySelector('#auth-submit-btn')?.click();
      return true;
    })()
  `);
  await waitEval(
    evalExpr,
    `Boolean(document.querySelector('#onboarding-step1-next'))`,
    30000
  );
  await evalExpr(`document.querySelector('#onboarding-step1-next')?.click()`);
  await sleep(250);
  await evalExpr(`document.querySelector('#onboarding-step2-next')?.click()`);
  await sleep(250);
  const homeT0 = Date.now();
  await evalExpr(`document.querySelector('#onboarding-finish-btn')?.click()`);
  await waitEval(evalExpr, `Boolean(document.querySelector('#add-habit-btn-above-list'))`, 20000);
  console.log('home_ms', Date.now() - homeT0);

  // Poll pointer-events until auto (or 30s)
  const lockT0 = Date.now();
  let unlockedAt = null;
  const samples = [];
  for (let i = 0; i < 300; i++) {
    const s = await evalExpr(`
      (function(){
        const btn=document.querySelector('#add-habit-btn-above-list');
        if(!btn) return null;
        return {
          pe: getComputedStyle(btn).pointerEvents,
          overlay: !!document.querySelector('.driver-overlay'),
          popover: !!document.querySelector('.driver-popover'),
          driverActive: document.documentElement.classList.contains('driver-active'),
        };
      })()
    `);
    samples.push({ t: Date.now() - lockT0, ...s });
    if (s && s.pe === 'auto' && !s.overlay) {
      unlockedAt = Date.now() - lockT0;
      break;
    }
    // If tour is active, try clicking Next/Done on driver popover to advance
    if (s && (s.overlay || s.popover)) {
      await evalExpr(`
        (function(){
          const done = document.querySelector('.driver-popover-next-btn, .driver-popover-done-btn, button.driver-next-btn, button.driver-done-btn');
          if (done) done.click();
          const close = document.querySelector('.driver-popover-close-btn');
          if (close) close.click();
          return !!done || !!close;
        })()
      `);
    }
    await sleep(100);
  }
  console.log('UNLOCK', { unlockedAtMs: unlockedAt, totalPollMs: Date.now() - lockT0 });
  console.log('SAMPLES_HEAD', JSON.stringify(samples.slice(0, 8)));
  console.log('SAMPLES_TAIL', JSON.stringify(samples.slice(-5)));

  // Real ADB tap once unlocked
  const geo = await evalExpr(`
    (function(){
      const btn=document.querySelector('#add-habit-btn-above-list');
      const r=btn.getBoundingClientRect();
      const dpr=window.devicePixelRatio||1;
      return { x: Math.round((r.left+r.width/2)*dpr), y: Math.round((r.top+r.height/2)*dpr), pe:getComputedStyle(btn).pointerEvents };
    })()
  `);
  console.log('GEO', geo);
  const tapT0 = Date.now();
  await runAdb(['shell', 'input', 'tap', String(geo.x), String(geo.y)]);
  let latency = null;
  for (let i = 0; i < 200; i++) {
    await sleep(25);
    const open = await evalExpr(
      `Boolean(document.querySelector('#add-habit-modal-card')||document.querySelector('#add-habit-modal-overlay'))`
    );
    if (open) {
      latency = Date.now() - tapT0;
      break;
    }
  }
  console.log('ADB_PLUS_TAP', { latencyMs: latency, wallMs: Date.now() - tapT0 });
  ws.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
