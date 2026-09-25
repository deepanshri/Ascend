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

// Switch to signup tab
await send('Runtime.evaluate', {
  expression: `document.querySelector('#auth-tab-signup').click()`
});
await new Promise(r => setTimeout(r, 200));

const testEmail = `perf_${Date.now()}@ascend.app`;
console.log('Testing signup with:', testEmail);

const fillRes = await send('Runtime.evaluate', {
  expression: `
    (function() {
      function setVal(input, val) {
        const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
        desc.set.call(input, val);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
      const name = document.querySelector('#auth-input-name');
      const email = document.querySelector('#auth-input-email');
      const pass = document.querySelector('#auth-input-password');

      if (!name || !email || !pass) return { error: 'Inputs not found', hasName: !!name, hasEmail: !!email, hasPass: !!pass };

      setVal(name, 'Validation User');
      setVal(email, '${testEmail}');
      setVal(pass, 'AscendSecure2026!');

      return {
        nameVal: name.value,
        emailVal: email.value,
        passVal: pass.value
      };
    })()
  `,
  returnByValue: true
});
console.log('Filled inputs:', fillRes.result?.value);

// Submit form
const submitRes = await send('Runtime.evaluate', {
  expression: `
    (function() {
      const btn = document.querySelector('#auth-submit-btn');
      if (!btn) return 'NO SUBMIT BTN';
      btn.click();
      return 'SUBMITTED';
    })()
  `,
  returnByValue: true
});
console.log('Submit result:', submitRes.result?.value);

// Wait and check what appears
for (let i = 0; i < 20; i++) {
  await new Promise(r => setTimeout(r, 500));
  const check = await send('Runtime.evaluate', {
    expression: `
      ({
        onboarding: Boolean(document.querySelector('#onboarding-screen')),
        authError: document.querySelector('[role="alert"]')?.innerText,
        confirmEmail: Boolean(document.body.innerText.includes('Check your inbox')),
        session: Boolean(localStorage.getItem('ascend_user_session'))
      })
    `,
    returnByValue: true
  });
  console.log(`Poll [${i}]:`, check.result?.value);
  if (check.result?.value?.onboarding || check.result?.value?.authError || check.result?.value?.confirmEmail) {
    break;
  }
}

ws.close();
