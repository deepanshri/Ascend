import { spawn } from 'child_process';

const ADB = 'C:\\Users\\deepa\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe';
const SERIAL = 'emulator-5554';
const CDP_PORT = 9223;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function runAdb(args, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ADB, ['-s', SERIAL, ...args], { windowsHide: true });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`adb timeout: ${args.join(' ')}`));
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
  if (!match) throw new Error('no webview socket');
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
      const timer = setTimeout(() => reject(new Error('eval timeout')), 15000);
      const h = (ev) => {
        const d = JSON.parse(ev.data);
        if (d.id === cur) {
          clearTimeout(timer);
          ws.removeEventListener('message', h);
          if (d.error) reject(new Error(JSON.stringify(d.error)));
          else if (d.result?.exceptionDetails)
            reject(new Error(JSON.stringify(d.result.exceptionDetails)));
          else resolve(d.result?.result?.value ?? d.result?.value);
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

async function main() {
  const { ws, evalExpr } = await connect();

  // Close modal if open
  await evalExpr(`
    (function(){
      const o = document.querySelector('#add-habit-modal-overlay');
      if (o) { const b = o.querySelector('button'); if (b) b.click(); }
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return true;
    })()
  `);
  await sleep(400);

  const before = await evalExpr(`
    (function(){
      const btn = document.querySelector('#add-habit-btn-above-list');
      if (!btn) return { missing: true };
      const r = btn.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const top = document.elementFromPoint(cx, cy);
      const dpr = window.devicePixelRatio || 1;
      return {
        pe: getComputedStyle(btn).pointerEvents,
        driverActive: document.documentElement.classList.contains('driver-active'),
        overlay: !!document.querySelector('.driver-overlay'),
        popover: !!document.querySelector('.driver-popover'),
        modalOpen: !!document.querySelector('#add-habit-modal-card'),
        cssCx: cx,
        cssCy: cy,
        // Capacitor WebView: CSS px ≈ CSS layout; adb needs physical px
        adbX: Math.round(cx * dpr),
        adbY: Math.round(cy * dpr),
        dpr,
        topId: top && (top.id || ''),
        topTag: top && top.tagName,
        hitIsPlus: !!(top && (top === btn || btn.contains(top))),
        vw: window.innerWidth,
        vh: window.innerHeight,
      };
    })()
  `);
  console.log('BEFORE_TAP', JSON.stringify(before, null, 2));

  if (before?.missing) throw new Error('plus missing');

  // Native tap at CSS coords first (many emulators map 1:1), then DPR if needed
  const t0 = Date.now();
  await runAdb(['shell', 'input', 'tap', String(Math.round(before.cssCx)), String(Math.round(before.cssCy))]);

  let visible = false;
  let latency = null;
  for (let i = 0; i < 200; i++) {
    await sleep(25);
    visible = await evalExpr(
      `Boolean(document.querySelector('#add-habit-modal-card') || document.querySelector('#add-habit-modal-overlay'))`
    );
    if (visible) {
      latency = Date.now() - t0;
      break;
    }
  }
  console.log('ADB_CSS_TAP', { visible, latencyMs: latency, wallMs: Date.now() - t0 });

  if (!visible && before.dpr !== 1) {
    const t1 = Date.now();
    await runAdb(['shell', 'input', 'tap', String(before.adbX), String(before.adbY)]);
    for (let i = 0; i < 200; i++) {
      await sleep(25);
      visible = await evalExpr(
        `Boolean(document.querySelector('#add-habit-modal-card') || document.querySelector('#add-habit-modal-overlay'))`
      );
      if (visible) {
        latency = Date.now() - t1;
        break;
      }
    }
    console.log('ADB_DPR_TAP', { visible, latencyMs: latency, wallMs: Date.now() - t1 });
  }

  const after = await evalExpr(`
    (function(){
      const btn = document.querySelector('#add-habit-btn-above-list');
      return {
        pe: btn ? getComputedStyle(btn).pointerEvents : 'missing',
        modalOpen: !!document.querySelector('#add-habit-modal-card'),
        overlay: !!document.querySelector('.driver-overlay'),
        popover: !!document.querySelector('.driver-popover'),
      };
    })()
  `);
  console.log('AFTER', JSON.stringify(after, null, 2));
  ws.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
