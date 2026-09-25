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

const res = await send('Runtime.evaluate', {
  expression: `
    ({
      buttons: Array.from(document.querySelectorAll('#onboarding-screen button')).map(b => ({
        id: b.id,
        className: b.className,
        text: b.innerText
      })),
      text: document.querySelector('#onboarding-screen')?.innerText
    })
  `,
  returnByValue: true
});

console.log(JSON.stringify(res.result?.value, null, 2));
ws.close();
