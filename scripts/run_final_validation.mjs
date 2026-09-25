import { spawn } from 'child_process';

const ADB = 'C:\\Users\\deepa\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe';
const CDP_PORT = 9223;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runAdb(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ADB, args);
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => (stdout += d.toString()));
    proc.stderr.on('data', (d) => (stderr += d.toString()));
    proc.on('close', (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`ADB command failed (${code}): ${stderr || stdout}`));
    });
  });
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
  const targets = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`).then((r) => r.json());
  if (!targets.length) throw new Error('No WebView targets found');
  const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  return new CDPClient(ws);
}

async function forwardDevToolsPort() {
  const sockets = await runAdb(['shell', 'cat', '/proc/net/unix']);
  const socketMatch = sockets.match(/@(webview_devtools_remote_\d+)/);
  if (!socketMatch) throw new Error('Could not find webview devtools socket');
  await runAdb(['forward', `tcp:${CDP_PORT}`, `localabstract:${socketMatch[1]}`]);
}

async function main() {
  console.log('================================================================');
  console.log(' FINAL PRODUCTION PERFORMANCE VALIDATION OF ASCEND ON ANDROID ');
  console.log('================================================================\n');

  // STEP 1: Cold start Android app via ActivityManager
  console.log('--- METRIC 1: App launch → first interactive UI ---');
  console.log('Starting app cold via adb shell am start -S -W ...');
  const amOutput = await runAdb([
    'shell',
    'am',
    'start',
    '-S',
    '-W',
    '-n',
    'com.ascend.habittracker/.MainActivity',
  ]);
  console.log(amOutput);
  const totalTimeMatch = amOutput.match(/TotalTime:\s*(\d+)/);
  const waitTimeMatch = amOutput.match(/WaitTime:\s*(\d+)/);
  const osColdStartTime = totalTimeMatch ? parseInt(totalTimeMatch[1], 10) : 0;
  const osWaitTime = waitTimeMatch ? parseInt(waitTimeMatch[1], 10) : 0;
  console.log(`-> Android ActivityManager TotalTime: ${osColdStartTime} ms, WaitTime: ${osWaitTime} ms`);

  // Forward port and connect DevTools
  await sleep(1000);
  await forwardDevToolsPort();
  let cdp = await connectCDP();

  // Clear data to enforce 100% clean/fresh user install state
  console.log('\nEnforcing fresh install state (clearing localStorage and sessionStorage)...');
  await cdp.eval(`
    localStorage.clear();
    sessionStorage.clear();
    location.reload();
  `);
  await sleep(1500);

  // Re-forward and reconnect after reload
  await forwardDevToolsPort();
  cdp = await connectCDP();

  // Inject performance instrumentation
  await cdp.eval(`
    window.__PERF__ = {
      networkRequests: [],
      longTasks: [],
      frameDrops: 0
    };

    try {
      const taskObs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          window.__PERF__.longTasks.push({
            duration: Math.round(entry.duration),
            startTime: Math.round(entry.startTime),
            name: entry.name
          });
        }
      });
      taskObs.observe({ entryTypes: ['longtask'] });
    } catch(e) {}

    // Intercept fetch to track Supabase / network requests
    const origFetch = window.fetch;
    window.fetch = async function(...args) {
      const start = performance.now();
      const rawUrl = typeof args[0] === 'string' ? args[0] : args[0]?.url || 'unknown';
      const cleanUrl = rawUrl.split('?')[0];
      try {
        const res = await origFetch.apply(this, args);
        window.__PERF__.networkRequests.push({
          url: cleanUrl,
          status: res.status,
          duration: Math.round(performance.now() - start),
          method: args[1]?.method || 'GET'
        });
        return res;
      } catch (err) {
        window.__PERF__.networkRequests.push({
          url: cleanUrl,
          status: 'error',
          error: String(err),
          duration: Math.round(performance.now() - start),
          method: args[1]?.method || 'GET'
        });
        throw err;
      }
    };
  `);

  const authReady = await cdp.eval(`Boolean(document.querySelector('#auth-screen'))`);
  console.log(`-> Auth screen rendered and interactive: ${authReady}`);

  // STEP 2: Authenticate and progress through Onboarding
  console.log('\n--- METRIC 2: Login/onboarding completion → interactive Home ---');
  const testEmail = `perf_${Date.now()}@ascend.app`;
  console.log(`Creating fresh user account: ${testEmail}`);

  await cdp.eval(`document.querySelector('#auth-tab-signup').click()`);
  await sleep(100);

  await cdp.eval(`
    (function() {
      function setVal(input, val) {
        const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
        desc.set.call(input, val);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
      setVal(document.querySelector('#auth-input-name'), 'Performance Auditor');
      setVal(document.querySelector('#auth-input-email'), '${testEmail}');
      setVal(document.querySelector('#auth-input-password'), 'Validation123456!');
    })()
  `);

  await sleep(100);
  await cdp.eval(`document.querySelector('#auth-submit-btn').click()`);

  // Wait for onboarding
  let onboardingReady = false;
  for (let i = 0; i < 40; i++) {
    await sleep(200);
    onboardingReady = await cdp.eval(`Boolean(document.querySelector('#onboarding-step1-next'))`);
    if (onboardingReady) break;
  }
  console.log(`-> Onboarding screen rendered: ${onboardingReady}`);

  // Progress through slides
  await cdp.eval(`document.querySelector('#onboarding-step1-next').click()`);
  await sleep(200);
  await cdp.eval(`document.querySelector('#onboarding-step2-next').click()`);
  await sleep(200);

  // Measure exact Home transition and + button tap latency from within the WebView
  console.log('\n--- METRICS 3 & 4: + button tap → Create Habit visible & startup responsiveness ---');
  const liveMeasurementScript = `
    new Promise((resolve) => {
      const finishBtn = document.querySelector('#onboarding-finish-btn');
      if (!finishBtn) return resolve({ error: 'No finish button found' });

      const finishClickedTime = performance.now();
      finishBtn.click();

      // Poll for Home screen render
      const checkHomeInterval = setInterval(() => {
        const plusBtn = document.querySelector('#add-habit-btn-above-list');
        if (plusBtn) {
          clearInterval(checkHomeInterval);
          const homeMountedTime = performance.now();
          const homeMountLatencyMs = Math.round(homeMountedTime - finishClickedTime);

          // Tour & button states right at mount
          const tourActiveAtMount = document.documentElement.classList.contains('driver-active');
          const driverOverlayAtMount = Boolean(document.querySelector('.driver-overlay'));
          const plusBtnPointerEventsAtMount = window.getComputedStyle(plusBtn).pointerEvents;

          // Immediately tap '+' button
          const plusTapTime = performance.now();
          let modalOpened = false;

          const observer = new MutationObserver(() => {
            const card = document.querySelector('#add-habit-modal-card');
            if (card && !modalOpened) {
              modalOpened = true;
              const modalMountedTime = performance.now();
              observer.disconnect();

              const input = card.querySelector('input[type="text"]');
              const submitBtn = card.querySelector('button[type="submit"]');

              resolve({
                ok: true,
                homeMountLatencyMs,
                tourActiveAtMount,
                driverOverlayAtMount,
                plusBtnPointerEventsAtMount,
                plusTapToModalLatencyMs: Math.round(modalMountedTime - plusTapTime),
                modalPointerEvents: window.getComputedStyle(card).pointerEvents,
                modalInteractive: Boolean(input && submitBtn),
                inputInteractive: input ? !input.disabled : false
              });
            }
          });

          observer.observe(document.body, { childList: true, subtree: true });

          // Tap the '+' button
          plusBtn.click();

          setTimeout(() => {
            if (!modalOpened) {
              observer.disconnect();
              resolve({
                error: 'Timeout waiting for modal',
                homeMountLatencyMs,
                tourActiveAtMount,
                driverOverlayAtMount,
                elapsedSinceTapMs: Math.round(performance.now() - plusTapTime)
              });
            }
          }, 6000);
        }
      }, 8);
    });
  `;

  const liveResult = await cdp.eval(liveMeasurementScript);
  console.log('Live Transition & Tap Measurement Result:');
  console.log(JSON.stringify(liveResult, null, 2));

  // Collect performance telemetry
  console.log('\n--- METRIC 5: JS / main-thread blocking (Long Tasks >50ms) ---');
  const perfData = await cdp.eval(`window.__PERF__`);
  const longTasks = perfData?.longTasks || [];
  console.log(`Total Long Tasks detected: ${longTasks.length}`);
  if (longTasks.length > 0) {
    longTasks.forEach((t, i) => {
      console.log(`  [Task #${i + 1}] Duration: ${t.duration} ms | Start: ${t.startTime} ms`);
    });
  } else {
    console.log('  Zero Long Tasks (>50ms) detected during the entire Home transition and modal launch!');
  }

  console.log('\n--- METRIC 6: Supabase / network requests during startup ---');
  const networkRequests = perfData?.networkRequests || [];
  console.log(`Total Network Requests: ${networkRequests.length}`);
  networkRequests.forEach((req, i) => {
    console.log(`  [Req #${i + 1}] ${req.method} ${req.url} -> Status: ${req.status} (${req.duration} ms)`);
  });

  console.log('\n--- METRIC 7: React rendering / Modal interactivity verification ---');
  const modalState = await cdp.eval(`
    (function() {
      const card = document.querySelector('#add-habit-modal-card');
      const input = card?.querySelector('input[type="text"]');
      const submitBtn = card?.querySelector('button[type="submit"]');
      if (input) {
        input.value = 'Continuous Meditation';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      return {
        modalExists: Boolean(card),
        inputValue: input?.value,
        buttonText: submitBtn?.innerText,
        buttonDisabled: submitBtn?.disabled
      };
    })()
  `);
  console.log('Modal Input & Submission State:', modalState);

  console.log('\n--- METRIC 8: Driver.js / tour activity during startup ---');
  const tourState = await cdp.eval(`
    ({
      driverActive: document.documentElement.classList.contains('driver-active'),
      driverOverlay: Boolean(document.querySelector('.driver-overlay')),
      driverPopover: Boolean(document.querySelector('.driver-popover')),
      bodyPointerEvents: window.getComputedStyle(document.body).pointerEvents,
      htmlPointerEvents: window.getComputedStyle(document.documentElement).pointerEvents
    })
  `);
  console.log('Tour & Pointer Events State on Home:', tourState);

  // Close modal and verify subsequent responsiveness
  console.log('\nClosing modal and testing subsequent + button tap responsiveness...');
  const secondTapScript = `
    new Promise((resolve) => {
      const closeBtn = document.querySelector('#add-habit-modal-close-btn') || document.querySelector('#add-habit-modal-overlay');
      if (closeBtn) closeBtn.click();

      setTimeout(() => {
        const plusBtn = document.querySelector('#add-habit-btn-above-list');
        const tapTime = performance.now();
        let modalOpened = false;

        const observer = new MutationObserver(() => {
          const card = document.querySelector('#add-habit-modal-card');
          if (card && !modalOpened) {
            modalOpened = true;
            observer.disconnect();
            resolve({
              ok: true,
              secondTapLatencyMs: Math.round(performance.now() - tapTime)
            });
          }
        });

        observer.observe(document.body, { childList: true, subtree: true });
        plusBtn.click();

        setTimeout(() => {
          if (!modalOpened) {
            observer.disconnect();
            resolve({ error: 'Timeout on second tap' });
          }
        }, 3000);
      }, 400);
    });
  `;
  const secondTapResult = await cdp.eval(secondTapScript);
  console.log('Second Tap Result:', secondTapResult);

  console.log('\n================================================================');
  console.log(' VALIDATION VERDICT:');
  console.log(`- Cold Start (am start -W TotalTime): ${osColdStartTime} ms`);
  console.log(`- Home Mount Latency: ${liveResult.homeMountLatencyMs} ms`);
  console.log(`- First '+' Tap to Modal Visible: ${liveResult.plusTapToModalLatencyMs} ms`);
  console.log(`- Second '+' Tap to Modal Visible: ${secondTapResult.secondTapLatencyMs} ms`);
  console.log(`- Driver.js Lockout Eliminated: ${!liveResult.driverOverlayAtMount && !tourState.driverActive ? 'YES' : 'NO'}`);
  console.log(`- Long Tasks (>50ms): ${longTasks.length}`);
  console.log(`- Original 20–30s Input Freeze: ${liveResult.plusTapToModalLatencyMs < 300 ? 'PASS (RESOLVED)' : 'FAIL'}`);
  console.log('================================================================\n');

  cdp.ws.close();
}

main().catch((err) => {
  console.error('Validation script error:', err);
  process.exit(1);
});
