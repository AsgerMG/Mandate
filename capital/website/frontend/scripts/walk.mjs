// Walk the brief flow as a founder would, in the visible window.
//
// drive.mjs navigates and scrolls; this interacts — types, clicks options by
// the text a human would read, and screenshots each step. That is the
// difference between confirming a page renders and finding out whether a
// person can get through it.
//
// Usage: node scripts/walk.mjs <baseUrl> <shotDir>
const [, , base = "http://localhost:3210", shotDir = "/tmp"] = process.argv;
const PORT = process.env.CDP_PORT || 9222;
const { writeFileSync } = await import("node:fs");

const targets = await (await fetch(`http://localhost:${PORT}/json`)).json();
const page = targets.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) pending.get(m.id)(m.result), pending.delete(m.id); };
const send = (m, p = {}) => new Promise((res) => { pending.set(++id, res); ws.send(JSON.stringify({ id, method: m, params: p })); });
const PACE = Number(process.env.PACE || 1);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms * PACE));
const evaluate = async (expr) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }))?.result?.value;
const shot = async (n) => {
  const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  writeFileSync(`${shotDir}/${n}.png`, Buffer.from(r.data, "base64"));
  process.stdout.write(`  shot ${n}\n`);
};
const fillByPlaceholder = (ph, value) => evaluate(`(() => {
  const el = [...document.querySelectorAll('input,textarea')].find(i => (i.placeholder||'').toLowerCase().includes(${JSON.stringify(ph.toLowerCase())}));
  if (!el) return false;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
  setter.call(el, ${JSON.stringify(value)});
  el.dispatchEvent(new Event('input',{bubbles:true}));
  return true; })()`);
const pick = (text) => evaluate(`(() => {
  const t = ${JSON.stringify(text)}.toLowerCase().trim();
  const els = [...document.querySelectorAll('button,[role=button],label,a,span')];
  const exact = els.find(e => (e.innerText||'').toLowerCase().trim() === t);
  const el = exact || els.find(e => (e.innerText||'').toLowerCase().trim().startsWith(t));
  if (!el) return false; el.scrollIntoView({block:'center'}); el.click(); return true; })()`);
const selectCountry = (name) => evaluate(`(() => {
  const s = [...document.querySelectorAll('select')].find(x => [...x.options].some(o => new RegExp(${JSON.stringify(name)},'i').test(o.text)));
  if (!s) return false;
  const opt = [...s.options].find(o => new RegExp(${JSON.stringify(name)},'i').test(o.text));
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value').set;
  setter.call(s, opt.value); s.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`);
const questions = () => evaluate(`[...document.querySelectorAll('p')].map(p=>(p.innerText||'').trim()).filter(t=>t.endsWith('?')&&t.length>15)`);

await send("Page.enable"); await send("Runtime.enable");
await send("Page.navigate", { url: `${base}/brief` });
await sleep(3500);

// ── Kestrel: solo founder, Berlin, scheduling software for physio clinics ──
const P = {
  company: process.env.CO || "Kestrel",
  what: process.env.WHAT || "Scheduling and no-show prediction software for independent physiotherapy clinics",
  country: process.env.COUNTRY || "Germany",
  picks: (process.env.PICKS || "Software, AI, data or cloud|Developing or prototyping the product|€500K – €2.5M|1–9|Pilots with customers").split("|"),
};
process.stdout.write(`company: ${await fillByPlaceholder("Vyoma", P.company)}\n`);
await sleep(300);
process.stdout.write(`what: ${await fillByPlaceholder("collision-avoidance", P.what)}\n`);
await sleep(300);
process.stdout.write(`country: ${await selectCountry(P.country)}\n`);
await sleep(300);
for (const t of P.picks) {
  process.stdout.write(`  pick ${t}: ${await pick(t)}\n`);
  await sleep(250);
}
await shot("01-screen1-filled");
await pick("Continue");
process.stdout.write("submitted; waiting for round 2...\n");
for (let i = 0; i < 45; i += 1) {
  await sleep(2000);
  const qs = await questions();
  if (qs && qs.length) { process.stdout.write(`round 2 ready: ${qs.length} questions\n`); break; }
}
await sleep(1500);
await shot("02-round2");
const qs = await questions();
process.stdout.write((qs || []).map((q, i) => `  Q${i + 1}. ${q}`).join("\n") + "\n");

// Answer each question by taking a real option, the way a founder scanning
// quickly would, then go through to the memo.
const answered = await evaluate(`(() => {
  let n = 0;
  const seen = new Set();
  document.querySelectorAll('button, [role=button]').forEach(b => {
    const t = (b.innerText||'').trim();
    if (!t || /continue|back|write my|export|skip/i.test(t)) return;
    const group = b.parentElement;
    if (!group || seen.has(group)) return;
    seen.add(group); b.click(); n += 1;
  });
  return n; })()`);
process.stdout.write(`answered ${answered} groups\n`);
await sleep(1200);
await shot("03-round2-answered");
await pick("Write my funding memo");
process.stdout.write("generating the memo...\n");
for (let i = 0; i < 90; i += 1) {
  await sleep(2000);
  const done = await evaluate(`!!document.querySelector('#print-report')`);
  if (i === 4) await shot("04-generating");
  if (done) { process.stdout.write(`memo rendered after ~${i*2}s\n`); break; }
}
await sleep(2500);
await shot("05-memo");
ws.close();
