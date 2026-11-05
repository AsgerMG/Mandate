// LOOK AT THE POOL P QUESTION IN A REAL BROWSER, WITHOUT SPENDING A CENT.
//
// `planAdaptiveScreen` is one Haiku call, so driving /brief for real costs
// money and this workstream's budget is zero. Chrome's Fetch domain fulfils
// the two intake calls from a canned body instead, which means the REAL
// panel.tsx renders the REAL round shape -- not a preview page that
// re-implements the markup and therefore cannot show a layout defect.
//
// Two widths, because two of this week's defects were only visible at 390.
//
//   node scripts/_wsiv_look.mjs   (dev server on :3210 must already be up)
const BASE = process.env.BASE ?? "http://localhost:3210";
const OUT = process.env.OUT ?? "../capital/project-mgmt/findings/project_question_wsIV";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const PORT = 9333;
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PORT}`,
  "--no-first-run", "--user-data-dir=/tmp/wsiv-chrome", "about:blank",
], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The round a founder with a thin description gets with PROJECT_QUESTION_ARM=on.
// Pool P first, then a gate question and a commercial one, which is what the
// planner's own instructions ask for.
const ROUND = {
  round: {
    theme: "A few more things",
    // A FULL SCREEN, so the trade this feature makes is visible rather than
    // described: six questions is the cap, and Pool P is one of the six.
    questions: [
      {
        field: "needBy",
        question: "When do you need the money in the bank?",
        stake: "Decides which calls are still open to you this year",
        options: [
          { value: "asap_weeks", label: "Weeks, we are tight" },
          { value: "months_6", label: "Within six months" },
          { value: "months_18", label: "Within eighteen months" },
          { value: "flexible", label: "No fixed date" },
        ],
      },
      {
        field: "cofinancingBand",
        question: "How much of the project cost could you fund yourselves?",
        stake: "Decides whether the EIC Accelerator route is open to you",
        options: [
          { value: "<25%", label: "Under a quarter" },
          { value: "25-50%", label: "A quarter to a half" },
          { value: ">50%", label: "More than half" },
        ],
      },
      {
        field: "consortium",
        question: "Could you put a partner consortium together if a fund required one?",
        stake: "Decides whether the Eurostars route is open to you",
        options: [
          { value: "yes", label: "Yes, we have partners" },
          { value: "no", label: "No, we would go alone" },
          { value: "unsure", label: "Not sure yet" },
        ],
      },
    ],
    projectQuestions: [
      {
        id: "project::description",
        question: "These routes split on whether the work is new hardware or software "
          + "on top of existing kit. In your own words: what are you building, who is "
          + "it for, and what would this money pay for?",
        stake: "Re-ranks every fund on this list, not just one",
        options: [],
        instrumentId: "", instrumentName: "", gateKey: "project_description",
        quote: "", locator: "", openText: true,
      },
      {
        id: "eic_accelerator::consortium_required",
        question: "Would you be applying on your own, or alongside a partner already lined up?",
        stake: "Decides whether the Eurostars route is open to you",
        options: ["On our own", "With one industrial partner", "With a university"],
        instrumentId: "eic_accelerator", instrumentName: "EIC Accelerator",
        gateKey: "consortium_required",
        quote: "Applications may be submitted by a single company established in a Member State.",
        locator: "Work Programme 2026, s.2.1",
      },
      {
        id: "commercial::who_pays",
        question: "Who writes the cheque for this today?",
        stake: "Decides how the brief positions you to a public funder",
        options: ["Warehouse operators direct", "Through a systems integrator", "Nobody yet"],
        instrumentId: "", instrumentName: "", gateKey: "commercial_who_pays",
        quote: "", locator: "",
      },
    ],
  },
  profileSignal: { techDepthRead: "Deep-tech breakthrough", note: "" },
};
const VERDICT = {
  eligibilityScreen: [], instrumentTable: [{ instrumentId: "eic_accelerator" }],
  selfMatched: false, candidateInstrumentIds: ["eic_accelerator"],
};

async function connect() {
  for (let i = 0; i < 40; i++) {
    try {
      const t = await (await fetch(`http://localhost:${PORT}/json`)).json();
      const p = t.find((x) => x.type === "page");
      if (p) return p;
    } catch { /* not up yet */ }
    await sleep(300);
  }
  throw new Error("chrome did not come up");
}

const page = await connect();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
const handlers = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
  else if (m.method) for (const h of handlers) h(m);
};
const send = (method, params = {}) =>
  new Promise((res) => { pending.set(++id, res); ws.send(JSON.stringify({ id, method, params })); });

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64");
await send("Page.enable");
await send("Runtime.enable");
await send("Fetch.enable", { patterns: [{ urlPattern: "*/api/intelligence/*" }] });
handlers.push(async (m) => {
  if (m.method !== "Fetch.requestPaused") return;
  const { requestId, request } = m.params;
  const body = request.url.includes("/intake") ? ROUND
    : request.url.includes("/verdict") ? VERDICT
      : { region: "DE21" };
  await send("Fetch.fulfillRequest", {
    requestId, responseCode: 200,
    responseHeaders: [{ name: "content-type", value: "application/json" }],
    body: b64(body),
  });
});

async function shot(width, height, name) {
  await send("Emulation.setDeviceMetricsOverride",
    { width, height, deviceScaleFactor: 2, mobile: width < 500 });
  await sleep(600);
  const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  mkdirSync(OUT, { recursive: true });
  writeFileSync(path.join(OUT, name), Buffer.from(data, "base64"));
  process.stdout.write(`wrote ${path.join(OUT, name)}\n`);
}

const evaluate = async (expression) =>
  (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result?.value;

await send("Page.navigate", { url: `${BASE}/brief` });
await sleep(6000);

// React controlled inputs ignore `.value =`; the native setter plus an input
// event is what the framework listens for.
await evaluate(`(() => {
  const set = (el, v) => {
    const s = Object.getOwnPropertyDescriptor(el.constructor.prototype, "value").set;
    s.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const inputs = [...document.querySelectorAll("input,textarea")];
  const company = inputs.find((i) => i.tagName === "INPUT");
  if (company) set(company, "Neura Robotics");
  const ta = document.querySelector("textarea");
  if (ta) set(ta, "robots");
  return { inputs: inputs.length, company: !!company, textarea: !!ta };
})()`).then((r) => process.stdout.write(`filled: ${JSON.stringify(r)}\n`));
await sleep(500);

// The first Continue is stopped once by the thin-description nudge; the second
// press is "Continue anyway", which is exactly the founder Pool P is for.
for (let i = 0; i < 3; i++) {
  const clicked = await evaluate(`(() => {
    const b = [...document.querySelectorAll("button")]
      .find((x) => /continue|anyway|find my/i.test(x.textContent||""));
    if (!b) return null; b.click(); return b.textContent.trim();
  })()`);
  process.stdout.write(`click ${i}: ${clicked}\n`);
  await sleep(2500);
  const onRound = await evaluate(
    `document.body.innerText.includes("About your project")`);
  if (onRound) { process.stdout.write("reached the adaptive round\n"); break; }
}

await shot(1440, 1200, "round_1440.png");
await shot(390, 900, "round_390.png");
process.stdout.write(await evaluate(`document.body.innerText.slice(0, 2000)`) + "\n");
ws.close();
chrome.kill();
