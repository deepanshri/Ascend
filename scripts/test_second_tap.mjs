const targets = await fetch('http://127.0.0.1:9223/json/list').then(r => r.json());
const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
let id = 1;
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

// Close modal first
await send('Runtime.evaluate', { expression: `document.querySelector('#add-habit-modal-close-btn')?.click() || document.querySelector('#add-habit-modal-overlay')?.click()` });
await new Promise(r => setTimeout(r, 600));

// Click + again and measure
const t0 = Date.now();
await send('Runtime.evaluate', { expression: `document.querySelector('#add-habit-btn-above-list')?.click()` });
let found = false, elapsed = 0;
for (let i = 0; i < 50; i++) {
  await new Promise(r => setTimeout(r, 10));
  const m = await send('Runtime.evaluate', { expression: `Boolean(document.querySelector('#add-habit-modal-card'))`, returnByValue: true });
  if (m.result?.value) { found = true; elapsed = Date.now() - t0; break; }
}
console.log('Second tap latency:', elapsed, 'ms');
ws.close();
