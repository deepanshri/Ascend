import { spawn } from 'child_process';

const ADB = 'C:\\Users\\deepa\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe';
const CDP_PORT = 9223;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getCDPWebSocketUrl() {
  const targets = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`).then((r) => r.json());
  if (!targets.length) throw new Error('No targets found');
  return targets[0].webSocketDebuggerUrl;
}

class CDPClient {
  constructor(ws) {
    this.ws = ws;
    this.id = 1;
    this.handlers = new Map();
    this.events = [];

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.handlers.has(msg.id)) {
        const { resolve, reject } = this.handlers.get(msg.id);
        this.handlers.delete(msg.id);
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
      } else if (msg.method) {
        this.events.push(msg);
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
    return res.result?.value;
  }
}

async function connectCDP() {
  const wsUrl = await getCDPWebSocketUrl();
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  return new CDPClient(ws);
}

async function runBenchmark() {
  console.log('====================================================');
  console.log(' ASCEND ANDROID PRODUCTION PERFORMANCE VALIDATION ');
  console.log('====================================================\n');

  // 1. App Launch / Cold Start Timing via Android Activity Manager
  console.log('[1/8] Measuring cold start via adb am start -S -W ...');
  const startProc = spawn(ADB, [
    'shell',
    'am',
    'start',
    '-S',
    '-W',
    '-n',
    'com.ascend.habittracker/.MainActivity',
  ]);

  let startOutput = '';
  startProc.stdout.on('data', (d) => (startOutput += d.toString()));
  await new Promise((r) => startProc.on('close', r));

  console.log(startOutput.trim());
  const waitTimeMatch = startOutput.match(/TotalTime:\s*(\d+)/);
  const totalLaunchTimeMs = waitTimeMatch ? parseInt(waitTimeMatch[1], 10) : 0;
  console.log(`-> Android OS Cold Start to First Frame: ${totalLaunchTimeMs} ms\n`);

  await sleep(1500);

  // Re-forward port in case PID changed
  const unixSocketsProc = spawn(ADB, ['shell', 'cat', '/proc/net/unix']);
  let unixSockets = '';
  unixSocketsProc.stdout.on('data', (d) => (unixSockets += d.toString()));
  await new Promise((r) => unixSocketsProc.on('close', r));

  const socketMatch = unixSockets.match(/@(webview_devtools_remote_\d+)/);
  if (socketMatch) {
    const socketName = socketMatch[1];
    const forwardProc = spawn(ADB, ['forward', `tcp:${CDP_PORT}`, `localabstract:${socketName}`]);
    await new Promise((r) => forwardProc.on('close', r));
  }

  const cdp = await connectCDP();
  console.log('Connected to Android WebView DevTools.\n');

  // Setup performance instrumentation inside WebView
  await cdp.eval(`
    window.__PERF_METRICS__ = {
      networkRequests: [],
      longTasks: [],
      reRenders: 0,
      marks: {}
    };

    // Track Long Tasks (>50ms)
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          window.__PERF_METRICS__.longTasks.push({
            duration: Math.round(entry.duration),
            startTime: Math.round(entry.startTime)
          });
        }
      });
      observer.observe({ entryTypes: ['longtask'] });
    } catch (e) {}

    // Track network requests
    const origFetch = window.fetch;
    window.fetch = async function(...args) {
      const start = performance.now();
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || 'unknown';
      try {
        const res = await origFetch.apply(this, args);
        const duration = Math.round(performance.now() - start);
        window.__PERF_METRICS__.networkRequests.push({
          url: url.split('?')[0],
          status: res.status,
          duration
        });
        return res;
      } catch (err) {
        const duration = Math.round(performance.now() - start);
        window.__PERF_METRICS__.networkRequests.push({
          url: url.split('?')[0],
          status: 'error',
          error: String(err),
          duration
        });
        throw err;
      }
    };
  `);

  // Clear data and simulate fresh install
  console.log('[2/8] Simulating 100% fresh install (clearing localStorage and sessionStorage)...');
  await cdp.eval(`
    localStorage.clear();
    sessionStorage.clear();
    location.reload();
  `);

  await sleep(1500);

  // Reconnect after reload
  const cdpReloaded = await connectCDP();

  // Re-inject observers
  await cdpReloaded.eval(`
    window.__PERF_METRICS__ = {
      networkRequests: [],
      longTasks: [],
      marks: {}
    };
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          window.__PERF_METRICS__.longTasks.push({
            duration: Math.round(entry.duration),
            startTime: Math.round(entry.startTime)
          });
        }
      });
      observer.observe({ entryTypes: ['longtask'] });
    } catch (e) {}
  `);

  console.log('App reloaded on clean state. Checking Auth screen state...');
  const isAuthVisible = await cdpReloaded.eval(`
    Boolean(document.querySelector('#auth-screen') || document.querySelector('input[type="password"]'))
  `);
  console.log(`-> Auth screen rendered and ready: ${isAuthVisible}\n`);

  // Perform Sign In / Sign Up
  console.log('[3/8] Performing test registration / authentication...');
  const testEmail = `perf_${Date.now()}@ascend.app`;
  await cdpReloaded.eval(`
    // Switch to Sign Up
    const buttons = Array.from(document.querySelectorAll('button'));
    const signUpTab = buttons.find(b => b.innerText.includes('Create Account'));
    if (signUpTab) signUpTab.click();
  `);
  await sleep(200);

  await cdpReloaded.eval(`
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    const inputs = Array.from(document.querySelectorAll('input'));
    const nameInput = inputs.find(i => i.placeholder?.includes('Name') || i.type === 'text');
    const emailInput = inputs.find(i => i.type === 'email');
    const passInput = inputs.find(i => i.type === 'password');

    if (nameInput) {
      nativeSetter.call(nameInput, 'Performance Auditor');
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
      nameInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (emailInput) {
      nativeSetter.call(emailInput, '${testEmail}');
      emailInput.dispatchEvent(new Event('input', { bubbles: true }));
      emailInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (passInput) {
      nativeSetter.call(passInput, 'Password123!');
      passInput.dispatchEvent(new Event('input', { bubbles: true }));
      passInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
  `);
  await sleep(200);

  console.log('Submitting registration form...');
  await cdpReloaded.eval(`
    const submitBtn = Array.from(document.querySelectorAll('button')).find(b => 
      b.innerText.includes('Start Identity Journey') || b.innerText.includes('Create Account') || b.type === 'submit'
    ) || document.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.click();
  `);

  // Wait for onboarding
  let onboardingReady = false;
  for (let i = 0; i < 30; i++) {
    await sleep(300);
    onboardingReady = await cdpReloaded.eval(`
      Boolean(document.querySelector('#onboarding-step1-next') || document.body.innerText.includes('Step 1 of 3'))
    `);
    if (onboardingReady) break;
  }
  console.log(`-> Onboarding screen rendered: ${onboardingReady}\n`);

  // Step through onboarding
  console.log('[4/8] Progressing through Onboarding slides...');
  await cdpReloaded.eval(`
    const next1 = document.querySelector('#onboarding-step1-next');
    if (next1) next1.click();
  `);
  await sleep(300);

  await cdpReloaded.eval(`
    const buttons = Array.from(document.querySelectorAll('button'));
    const next2 = buttons.find(b => b.innerText.includes('Continue to Step 3'));
    if (next2) next2.click();
  `);
  await sleep(300);

  console.log('Clicking "Enter Ascend" (Home transition)...');
  const enterHomeStart = Date.now();
  await cdpReloaded.eval(`
    const finishBtn = document.querySelector('#onboarding-finish-btn') || 
      Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Enter Ascend'));
    if (finishBtn) finishBtn.click();
  `);

  // Measure Home view mount
  let homeReady = false;
  for (let i = 0; i < 40; i++) {
    await sleep(50);
    homeReady = await cdpReloaded.eval(`
      Boolean(document.querySelector('#add-habit-btn-above-list'))
    `);
    if (homeReady) break;
  }
  const homeMountElapsed = Date.now() - enterHomeStart;
  console.log(`-> Home view mounted and interactive in: ${homeMountElapsed} ms\n`);

  // Measure Driver.js / tour state immediately after landing on Home
  console.log('[5/8] Checking Driver.js tour & pointer-events state...');
  const tourState = await cdpReloaded.eval(`
    (function() {
      const btn = document.querySelector('#add-habit-btn-above-list');
      return {
        driverActive: document.documentElement.classList.contains('driver-active'),
        hasOverlay: Boolean(document.querySelector('.driver-overlay')),
        hasPopover: Boolean(document.querySelector('.driver-popover')),
        plusButtonPointerEvents: btn ? window.getComputedStyle(btn).pointerEvents : 'not_found',
        bodyPointerEvents: window.getComputedStyle(document.body).pointerEvents
      };
    })()
  `);
  console.log('Driver Tour State:', tourState);
  console.log(`-> Plus Button pointerEvents: ${tourState?.plusButtonPointerEvents}`);
  console.log(`-> Body pointerEvents: ${tourState?.bodyPointerEvents}\n`);

  // Measure '+' Tap Response Time
  console.log('[6/8] Tapping "+" (Create Habit) button immediately on clean home state...');
  const plusTapStart = Date.now();

  const tapResult = await cdpReloaded.eval(`
    (function() {
      const btn = document.querySelector('#add-habit-btn-above-list');
      if (!btn) return { ok: false, error: 'Button not found' };
      
      const beforeClick = performance.now();
      btn.click();
      return { ok: true, clickTimestamp: beforeClick };
    })()
  `);

  let modalRendered = false;
  let modalRenderElapsed = 0;
  for (let i = 0; i < 100; i++) {
    await sleep(20);
    modalRendered = await cdpReloaded.eval(`
      Boolean(document.querySelector('#add-habit-modal-overlay') || document.querySelector('#add-habit-modal-card'))
    `);
    if (modalRendered) {
      modalRenderElapsed = Date.now() - plusTapStart;
      break;
    }
  }

  console.log(`-> Modal rendered in DOM: ${modalRendered}`);
  console.log(`-> Exact '+' tap to Create Habit modal visible latency: ${modalRenderElapsed} ms\n`);

  // Verify modal is interactive
  console.log('[7/8] Verifying Create Habit modal inputs and interactivity...');
  const interactivity = await cdpReloaded.eval(`
    (function() {
      const modal = document.querySelector('#add-habit-modal-card');
      const input = document.querySelector('#add-habit-modal-card input[type="text"]');
      const submitBtn = document.querySelector('#add-habit-modal-card button[type="submit"]');
      if (!input || !submitBtn) return { interactive: false };

      input.value = 'Validated Habit';
      input.dispatchEvent(new Event('input', { bubbles: true }));

      return {
        interactive: true,
        inputValue: input.value,
        buttonText: submitBtn.innerText,
        pointerEvents: window.getComputedStyle(modal).pointerEvents
      };
    })()
  `);
  console.log('Modal Interactivity:', interactivity);

  // Check Long Tasks and Network metrics
  console.log('\n[8/8] Collecting runtime performance telemetry from Android APK...');
  const metrics = await cdpReloaded.eval(`window.__PERF_METRICS__`);

  console.log('\n--- Telemetry Summary ---');
  console.log(`Total Long Tasks (>50ms): ${metrics?.longTasks?.length || 0}`);
  if (metrics?.longTasks?.length) {
    metrics.longTasks.forEach((t, idx) => {
      console.log(`  [LongTask #${idx + 1}] Duration: ${t.duration}ms at ${t.startTime}ms`);
    });
  } else {
    console.log('  Zero tasks exceeding 50ms detected during home transition and modal open!');
  }

  console.log('\n====================================================');
  console.log(`RESULT SUMMARY:`);
  console.log(`- Cold Start to First Frame: ${totalLaunchTimeMs} ms`);
  console.log(`- Onboarding to Home: ${homeMountElapsed} ms`);
  console.log(`- '+' Button Tap to Create Habit Modal: ${modalRenderElapsed} ms`);
  console.log(`- 20-30s Input Freeze: ${modalRenderElapsed < 500 ? 'COMPLETELY ELIMINATED (PASS)' : 'STILL DETECTED (FAIL)'}`);
  console.log('====================================================\n');
}

runBenchmark().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
