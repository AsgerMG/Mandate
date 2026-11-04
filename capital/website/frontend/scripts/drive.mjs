// Drive a VISIBLE Chrome window over the DevTools protocol.
//
// The headless harness renders and screenshots, which is enough to verify
// layout but shows nobody anything while it happens. This opens a real window
// on the desktop and steps through the site in it, so a person can watch the
// same run rather than read a description of it afterwards.
//
// Node 22 ships a global WebSocket, so the protocol needs no dependency: CDP
// is a JSON-RPC channel over one socket.
//
// Usage: node scripts/drive.mjs <baseUrl> <route> [route...]
const [, , base = "http://localhost:3210", ...routes] = process.argv;
const PORT = process.env.CDP_PORT || 9222;

const targets = await (await fetch(`http://localhost:${PORT}/json`)).json();
const page = targets.find((t) => t.type === "page");
if (!page) throw new Error("no page target; is Chrome running with --remote-debugging-port?");

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));

let id = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result); pending.delete(msg.id); }
};
const send = (method, params = {}) =>
  new Promise((res) => { pending.set(++id, res); ws.send(JSON.stringify({ id, method, params })); });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await send("Page.enable");
for (const route of routes.length ? routes : ["/brief"]) {
  const url = base + route;
  process.stdout.write(`navigating to ${url}\n`);
  await send("Page.navigate", { url });
  await sleep(2500);
  // Scroll slowly so the whole page is actually seen, not just its top.
  for (let i = 0; i < 6; i += 1) {
    await send("Runtime.evaluate", { expression: "window.scrollBy({top: 500, behavior: 'smooth'})" });
    await sleep(700);
  }
  await sleep(800);
}
process.stdout.write("done\n");
ws.close();
