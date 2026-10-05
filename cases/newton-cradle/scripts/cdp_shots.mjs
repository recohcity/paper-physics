// CDP driver v2: connects to the browser endpoint and creates a page target.
import fs from 'fs';
const CDP_HTTP = 'http://127.0.0.1:9222';
const APP_URL = 'http://127.0.0.1:5174/cases/newton-cradle/dist/';
const OUT = '/Users/citylivepark/Documents/project/IdeaLab/paper-trebuchet/cases/newton-cradle/docs/boot-selfcheck';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let msgId = 0;
const pending = new Map();
function send(ws, method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    const frame = { id, method, params };
    if (sessionId) frame.sessionId = sessionId;
    ws.send(JSON.stringify(frame));
  });
}

async function main() {
  const ver = await (await fetch(`${CDP_HTTP}/json/version`)).json();
  const ws = new WebSocket(ver.webSocketDebuggerUrl);
  const logs = [];
  await new Promise(r => ws.addEventListener('open', r));

  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.method + ': ' + JSON.stringify(msg.error)));
      else resolve(msg.result);
    } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      logs.push('CONSOLE.ERROR: ' + msg.params.args.map(a => a.value ?? a.description ?? '').join(' '));
    } else if (msg.method === 'Runtime.exceptionThrown') {
      logs.push('EXCEPTION: ' + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
    }
  });

  const { targetId } = await send(ws, 'Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send(ws, 'Target.attachToTarget', { targetId, flatten: true });

  await send(ws, 'Page.enable', {}, sessionId);
  await send(ws, 'Runtime.enable', {}, sessionId);
  await send(ws, 'Page.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);

  // SKETCH frame
  await send(ws, 'Page.navigate', { url: APP_URL }, sessionId);
  await sleep(3500);
  let shot = await send(ws, 'Page.captureScreenshot', { format: 'png' }, sessionId);
  fs.writeFileSync(`${OUT}/sketch_step.png`, Buffer.from(shot.data, 'base64'));
  console.log('saved sketch_step.png');

  // Click Play, let LIFT run in real time
  await send(ws, 'Runtime.evaluate', { expression: "document.getElementById('btn-play-tour').click()" }, sessionId);
  await sleep(5500);
  shot = await send(ws, 'Page.captureScreenshot', { format: 'png' }, sessionId);
  fs.writeFileSync(`${OUT}/lift_step.png`, Buffer.from(shot.data, 'base64'));
  console.log('saved lift_step.png');

  const avail = await send(ws, 'Runtime.evaluate', {
    expression: `Array.from(document.querySelectorAll('.tour-step')).map(b => b.dataset.step+':'+b.textContent+(b.disabled?'(off)':'(on)')).join(' ')`
  }, sessionId);
  console.log('tour buttons:', avail.result.value);

  console.log('--- JS logs ---');
  console.log(logs.length ? logs.join('\n') : '(no console errors / exceptions)');
  ws.close();
  process.exit(0);
}
main().catch(e => { console.error('DRIVER ERROR', e); process.exit(1); });
