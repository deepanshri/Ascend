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

// Enable Log and Runtime console
await send('Log.enable');
await send('Runtime.enable');

const state = await send('Runtime.evaluate', {
  expression: `
    ({
      html: document.body.innerHTML.substring(0, 500),
      session: localStorage.getItem('ascend_user_session'),
      onboarded: localStorage.getItem('ascend_onboarding_completed')
    })
  `,
  returnByValue: true
});

console.log('State:', state.result?.value);
ws.close();
