const targets = await fetch('http://127.0.0.1:9223/json/list').then(r => r.json());
const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
let id = 1;
const logs = [];
ws.onmessage = (e) => {
  const d = JSON.parse(e.data);
  if (d.method === 'Runtime.consoleAPICalled') {
    logs.push({ type: d.params.type, text: d.params.args.map(a => a.value || a.description).join(' ') });
  } else if (d.method === 'Log.entryAdded') {
    logs.push({ level: d.params.entry.level, text: d.params.entry.text });
  }
};

const send = (m, p = {}) => new Promise(res => {
  const cur = id++;
  const h = (e) => {
    const d = JSON.parse(e.data);
    if (d.id === cur) { ws.removeEventListener('message', h); res(d.result); }
  };
  ws.addEventListener('message', h);
  ws.send(JSON.stringify({ id: cur, method: m, params: p }));
});

await new Promise(r => ws.onopen = r);
await send('Runtime.enable');
await send('Log.enable');

// Clear local data, reload
await send('Runtime.evaluate', {
  expression: `
    localStorage.clear();
    sessionStorage.clear();
    location.reload();
  `
});

await new Promise(r => setTimeout(r, 2000));
console.log('Reloaded. Connecting to fresh target...');

const t2 = await fetch('http://127.0.0.1:9223/json/list').then(r => r.json());
const ws2 = new WebSocket(t2[0].webSocketDebuggerUrl);
let id2 = 1;
const logs2 = [];
ws2.onmessage = (e) => {
  const d = JSON.parse(e.data);
  if (d.method === 'Runtime.consoleAPICalled') {
    logs2.push({ type: d.params.type, text: d.params.args?.map(a => a.value || a.description).join(' ') });
  } else if (d.method === 'Log.entryAdded') {
    logs2.push({ level: d.params.entry.level, text: d.params.entry.text });
  }
};
const send2 = (m, p = {}) => new Promise(res => {
  const cur = id2++;
  const h = (e) => {
    const d = JSON.parse(e.data);
    if (d.id === cur) { ws2.removeEventListener('message', h); res(d.result); }
  };
  ws2.addEventListener('message', h);
  ws2.send(JSON.stringify({ id: cur, method: m, params: p }));
});
await new Promise(r => ws2.onopen = r);
await send2('Runtime.enable');
await send2('Log.enable');

// Observe long tasks
await send2('Runtime.evaluate', {
  expression: `
    window.__TASKS__ = [];
    const obs = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__TASKS__.push({ duration: entry.duration, startTime: entry.startTime, name: entry.name });
      }
    });
    obs.observe({ entryTypes: ['longtask'] });
  `
});

// Fill auth signup
const testEmail = 'perf_' + Date.now() + '@ascend.app';
await send2('Runtime.evaluate', {
  expression: `
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    document.querySelector('#auth-tab-signup').click();
  `
});
await new Promise(r => setTimeout(r, 100));

await send2('Runtime.evaluate', {
  expression: `
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    const nameInp = document.querySelector('#auth-input-name');
    const emailInp = document.querySelector('#auth-input-email');
    const passInp = document.querySelector('#auth-input-password');

    nativeSetter.call(nameInp, 'Auditor');
    nameInp.dispatchEvent(new Event('input', { bubbles: true }));

    nativeSetter.call(emailInp, '${testEmail}');
    emailInp.dispatchEvent(new Event('input', { bubbles: true }));

    nativeSetter.call(passInp, 'Secret123456!');
    passInp.dispatchEvent(new Event('input', { bubbles: true }));

    document.querySelector('#auth-submit-btn').click();
  `
});

// Wait for onboarding
let onb = false;
for (let i = 0; i < 50; i++) {
  await new Promise(r => setTimeout(r, 100));
  const c = await send2('Runtime.evaluate', { expression: `Boolean(document.querySelector('#onboarding-step1-next'))`, returnByValue: true });
  if (c.result?.value) { onb = true; break; }
}
console.log('Onboarding reached:', onb);

// Click through slides properly
await send2('Runtime.evaluate', { expression: `document.querySelector('#onboarding-step1-next')?.click()` });
await new Promise(r => setTimeout(r, 200));
await send2('Runtime.evaluate', { expression: `document.querySelector('#onboarding-step2-next')?.click()` });
await new Promise(r => setTimeout(r, 200));

const enterHomeStart = Date.now();
await send2('Runtime.evaluate', { expression: `document.querySelector('#onboarding-finish-btn')?.click()` });

// Wait for Home
let home = false;
for (let i = 0; i < 50; i++) {
  await new Promise(r => setTimeout(r, 20));
  const c = await send2('Runtime.evaluate', { expression: `Boolean(document.querySelector('#add-habit-btn-above-list'))`, returnByValue: true });
  if (c.result?.value) { home = true; break; }
}
console.log(`Home reached: ${home} in ${Date.now() - enterHomeStart} ms`);

// Immediately check Driver.js state and pointerEvents
const tourCheck = await send2('Runtime.evaluate', {
  expression: `
    ({
      driverActive: document.documentElement.classList.contains('driver-active'),
      driverOverlay: Boolean(document.querySelector('.driver-overlay')),
      driverPopover: Boolean(document.querySelector('.driver-popover')),
      btnPointerEvents: window.getComputedStyle(document.querySelector('#add-habit-btn-above-list')).pointerEvents,
      bodyPointerEvents: window.getComputedStyle(document.body).pointerEvents
    })
  `,
  returnByValue: true
});
console.log('Tour check:', tourCheck.result?.value);

// Click '+' button immediately!
const plusStart = Date.now();
const clickRes = await send2('Runtime.evaluate', {
  expression: `
    (function() {
      const btn = document.querySelector('#add-habit-btn-above-list');
      btn.click();
      return 'CLICKED at ' + performance.now();
    })()
  `,
  returnByValue: true
});
console.log('Plus click invoked:', clickRes.result?.value);

// Poll for modal
let modal = false;
let modalElapsed = 0;
for (let i = 0; i < 150; i++) {
  await new Promise(r => setTimeout(r, 20));
  const c = await send2('Runtime.evaluate', {
    expression: `Boolean(document.querySelector('#add-habit-modal-card'))`,
    returnByValue: true
  });
  if (c.result?.value) {
    modal = true;
    modalElapsed = Date.now() - plusStart;
    break;
  }
}
console.log(`Modal visible: ${modal} in ${modalElapsed} ms`);

// Collect long tasks and logs
const tasks = await send2('Runtime.evaluate', { expression: `window.__TASKS__`, returnByValue: true });
console.log('\n--- Long Tasks during flow ---');
console.log(JSON.stringify(tasks.result?.value, null, 2));

console.log('\n--- Console Logs during flow ---');
logs2.forEach(l => console.log(`[${l.type || l.level}] ${l.text}`));

ws2.close();
ws.close();
