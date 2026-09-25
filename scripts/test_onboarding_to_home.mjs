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

// Step 1 -> Step 2
await send('Runtime.evaluate', { expression: `document.querySelector('#onboarding-step1-next')?.click()` });
await new Promise(r => setTimeout(r, 250));

// Step 2 -> Step 3
await send('Runtime.evaluate', { expression: `document.querySelector('#onboarding-step2-next')?.click()` });
await new Promise(r => setTimeout(r, 250));

// Step 3 -> Enter Ascend (Home)
console.log('Transitioning to Home...');
const tHomeStart = Date.now();

// Attach in-page observer for #add-habit-btn-above-list and measure tap to modal
const inPageExperiment = `
  new Promise((resolve) => {
    const finishBtn = document.querySelector('#onboarding-finish-btn');
    if (!finishBtn) return resolve({ error: 'No finish button found' });

    const finishClickedTime = performance.now();
    finishBtn.click();

    // 1. Wait for Home header and plus button
    const checkHomeInterval = setInterval(() => {
      const plusBtn = document.querySelector('#add-habit-btn-above-list');
      if (plusBtn) {
        clearInterval(checkHomeInterval);
        const homeMountedTime = performance.now();
        const homeMountLatency = Math.round(homeMountedTime - finishClickedTime);

        // Check Driver.js state at this exact instant
        const tourActive = document.documentElement.classList.contains('driver-active');
        const driverOverlay = Boolean(document.querySelector('.driver-overlay'));
        const btnStyle = window.getComputedStyle(plusBtn);

        // Immediately tap '+' button!
        const tapTime = performance.now();
        let modalOpened = false;

        const modalObserver = new MutationObserver(() => {
          const card = document.querySelector('#add-habit-modal-card');
          if (card && !modalOpened) {
            modalOpened = true;
            const modalMountedTime = performance.now();
            modalObserver.disconnect();
            resolve({
              ok: true,
              homeMountLatency,
              tourActive,
              driverOverlay,
              plusBtnPointerEvents: btnStyle.pointerEvents,
              plusTapToModalLatency: Math.round(modalMountedTime - tapTime),
              modalPointerEvents: window.getComputedStyle(card).pointerEvents
            });
          }
        });

        modalObserver.observe(document.body, { childList: true, subtree: true });

        // Trigger the click!
        plusBtn.click();

        setTimeout(() => {
          if (!modalOpened) {
            modalObserver.disconnect();
            resolve({
              error: 'Timeout waiting for modal',
              homeMountLatency,
              tourActive,
              driverOverlay,
              elapsedSinceTap: Math.round(performance.now() - tapTime)
            });
          }
        }, 5000);
      }
    }, 16);
  });
`;

const result = await send('Runtime.evaluate', {
  expression: inPageExperiment,
  awaitPromise: true,
  returnByValue: true
});

console.log('Result from live APK:', JSON.stringify(result.result?.value, null, 2));

ws.close();
