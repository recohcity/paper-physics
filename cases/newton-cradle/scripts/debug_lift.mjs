import fs from 'fs';
const CDP_HTTP = 'http://127.0.0.1:9222';
const APP_URL = 'http://127.0.0.1:5174/cases/newton-cradle/dist/';
const OUT = '/Users/citylivepark/Documents/project/IdeaLab/paper-trebuchet/cases/newton-cradle/docs/boot-selfcheck';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let msgId = 0; const pending = new Map();
function send(ws, method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const id = ++msgId; pending.set(id, { resolve, reject });
    const frame = { id, method, params }; if (sessionId) frame.sessionId = sessionId;
    ws.send(JSON.stringify(frame));
  });
}
async function evl(ws, expr, sessionId) {
  const r = await send(ws, 'Runtime.evaluate', { expression: expr, returnByValue: true }, sessionId);
  return r.result?.value;
}

const ver = await (await fetch(`${CDP_HTTP}/json/version`)).json();
const ws = new WebSocket(ver.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id).resolve(m.result); pending.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') {
    console.log('EXCEPTION:', m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    console.log('CONSOLE.ERROR:', m.params.args.map(a => a.value ?? a.description).join(' '));
  }
});
const { targetId } = await send(ws, 'Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send(ws, 'Target.attachToTarget', { targetId, flatten: true });
await send(ws, 'Page.enable', {}, sessionId);
await send(ws, 'Runtime.enable', {}, sessionId);
await send(ws, 'Page.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);

await send(ws, 'Page.navigate', { url: APP_URL }, sessionId);
await sleep(3500);

console.log('BEFORE click LIFT:');
console.log(' cutoutMesh exists:', await evl(ws, '!!window.__app.cutoutMesh', sessionId));
console.log(' cutoutLoaded:', await evl(ws, 'window.__app._cutoutLoaded', sessionId));
console.log(' step1 btn disabled:', await evl(ws, "document.querySelector('[data-step=1]').disabled", sessionId));

// click LIFT button directly
await evl(ws, "document.querySelector('[data-step=1]').click()", sessionId);
await sleep(400);
console.log('right after click:');
console.log(' visible:', await evl(ws, 'window.__app.cutoutMesh ? window.__app.cutoutMesh.visible : "NO MESH"', sessionId));
console.log(' rotation.x:', await evl(ws, 'window.__app.cutoutMesh ? window.__app.cutoutMesh.rotation.x.toFixed(3) : "-"', sessionId));
console.log(' opacity:', await evl(ws, 'window.__app.cutoutMesh ? window.__app.cutoutMesh.material.opacity.toFixed(2) : "-"', sessionId));

await sleep(4500); // let LIFT tween finish
console.log('after 4.5s:');
console.log(' rotation.x:', await evl(ws, 'window.__app.cutoutMesh ? window.__app.cutoutMesh.rotation.x.toFixed(3) : "-"', sessionId));
console.log(' opacity:', await evl(ws, 'window.__app.cutoutMesh ? window.__app.cutoutMesh.material.opacity.toFixed(2) : "-"', sessionId));
console.log(' banner:', await evl(ws, 'document.getElementById("tour-banner-text").textContent', sessionId));

const shot = await send(ws, 'Page.captureScreenshot', { format: 'png' }, sessionId);
fs.writeFileSync(`${OUT}/lift_step.png`, Buffer.from(shot.data, 'base64'));
console.log('saved lift_step.png');
ws.close(); process.exit(0);
