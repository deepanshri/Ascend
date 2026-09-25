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

// Test internal in-webview measurement
const measureScript = `
  new Promise((resolve) => {
    // If modal already open, close it
    const closeBtn = document.querySelector('#add-habit-modal-close-btn') || document.querySelector('#add-habit-modal-overlay');
    if (closeBtn) closeBtn.click();

    setTimeout(() => {
      const btn = document.querySelector('#add-habit-btn-above-list');
      if (!btn) return resolve({ error: 'No plus button found' });

      let modalAppeared = false;
      const t0 = performance.now();

      const observer = new MutationObserver(() => {
        const card = document.querySelector('#add-habit-modal-card');
        if (card && !modalAppeared) {
          modalAppeared = true;
          const t1 = performance.now();
          observer.disconnect();
          resolve({
            ok: true,
            latencyMs: Math.round(t1 - t0),
            pointerEvents: window.getComputedStyle(card).pointerEvents
          });
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });

      // Click the button
      btn.click();

      // Fallback timeout
      setTimeout(() => {
        if (!modalAppeared) {
          observer.disconnect();
          resolve({ error: 'Timeout waiting for modal', elapsed: Math.round(performance.now() - t0) });
        }
      }, 5000);
    }, 400);
  });
`;

const result = await send('Runtime.evaluate', {
  expression: measureScript,
  awaitPromise: true,
  returnByValue: true
});

console.log('In-WebView exact measurement:', result.result?.value);
ws.close();
