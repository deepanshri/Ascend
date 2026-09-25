const targets = await fetch('http://127.0.0.1:9223/json/list').then(r => r.json());
const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
let id = 1;
const send = (method, params = {}) => new Promise((resolve) => {
  const curId = id++;
  const handler = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id === curId) {
      ws.removeEventListener('message', handler);
      resolve(msg.result);
    }
  };
  ws.addEventListener('message', handler);
  ws.send(JSON.stringify({ id: curId, method, params }));
});

await new Promise(r => ws.onopen = r);

// Check current buttons
const btns = await send('Runtime.evaluate', {
  expression: `Array.from(document.querySelectorAll('button')).map(b => ({ id: b.id, text: b.innerText }))`,
  returnByValue: true
});
console.log('Current buttons:', btns.result?.value);

// Click finish button if present
const clickStart = Date.now();
const clickRes = await send('Runtime.evaluate', {
  expression: `
    (function() {
      const btn = document.querySelector('#onboarding-finish-btn');
      if (!btn) return 'NO FINISH BTN';
      btn.click();
      return 'CLICKED';
    })()
  `,
  returnByValue: true
});
console.log('Finish click:', clickRes.result?.value);

// Poll for #add-habit-btn-above-list
let found = false;
let elapsed = 0;
for (let i = 0; i < 50; i++) {
  await new Promise(r => setTimeout(r, 20));
  const check = await send('Runtime.evaluate', {
    expression: `Boolean(document.querySelector('#add-habit-btn-above-list'))`,
    returnByValue: true
  });
  if (check.result?.value) {
    found = true;
    elapsed = Date.now() - clickStart;
    break;
  }
}

console.log(`Home loaded: ${found} in ${elapsed} ms`);

// Now immediately test clicking '+'
if (found) {
  const plusStart = Date.now();
  const plusClick = await send('Runtime.evaluate', {
    expression: `
      (function() {
        const btn = document.querySelector('#add-habit-btn-above-list');
        btn.click();
        return 'PLUS CLICKED';
      })()
    `,
    returnByValue: true
  });
  console.log('Plus click:', plusClick.result?.value);

  let modalFound = false;
  let modalElapsed = 0;
  for (let i = 0; i < 50; i++) {
    await new Promise(r => setTimeout(r, 10));
    const mCheck = await send('Runtime.evaluate', {
      expression: `Boolean(document.querySelector('#add-habit-modal-overlay') || document.querySelector('#add-habit-modal-card'))`,
      returnByValue: true
    });
    if (mCheck.result?.value) {
      modalFound = true;
      modalElapsed = Date.now() - plusStart;
      break;
    }
  }
  console.log(`Create Habit Modal visible: ${modalFound} in ${modalElapsed} ms`);
}

ws.close();
