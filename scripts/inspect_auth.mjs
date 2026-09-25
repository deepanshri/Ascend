async function inspectAuth() {
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
  ws.onopen = async () => {
    const res = await send('Runtime.evaluate', {
      expression: 'document.body.innerText',
      returnByValue: true
    });
    console.log('SCREEN TEXT:\n', res.result?.value);

    const inputs = await send('Runtime.evaluate', {
      expression: 'Array.from(document.querySelectorAll("input")).map(i => ({ type: i.type, placeholder: i.placeholder, value: i.value }))',
      returnByValue: true
    });
    console.log('INPUTS:\n', inputs.result?.value);

    const errorMsg = await send('Runtime.evaluate', {
      expression: 'document.querySelector("[role=\\"alert\\"]")?.innerText || document.querySelector(".text-rose-500")?.innerText',
      returnByValue: true
    });
    console.log('ERROR MSG:\n', errorMsg.result?.value);

    ws.close();
  };
}
inspectAuth();
