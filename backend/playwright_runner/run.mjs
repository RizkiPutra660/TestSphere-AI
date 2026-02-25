import fs from "fs";
import path from "path";
import { execSync } from "child_process";

function getArg(name) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

function mustGetArg(name) {
  const val = getArg(name);
  if (!val) throw new Error(`Missing arg ${name}`);
  return val;
}

function normalizeBaseUrl(url) {
  return String(url).trim().replace(/\/+$/, "");
}

function normalizePath(p) {
  let s = String(p || "").trim();
  if (!s) return "";
  if (!s.startsWith("/")) s = "/" + s;
  return s;
}

function safeJsonParse(str, fallback) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

/**
 * API runner helpers (your existing logic)
 */
function normalizeRequests({ endpointsRaw, requestsRaw }) {
  if (requestsRaw) {
    const parsed = safeJsonParse(requestsRaw, null);
    if (!Array.isArray(parsed)) {
      throw new Error(`--requests must be a JSON array. Got: ${requestsRaw}`);
    }

    const out = [];
    for (const r of parsed) {
      const method = String(r?.method || "GET").toUpperCase().trim();
      const p = normalizePath(r?.path || r?.endpoint || "");
      const body = r?.body ?? null;

      if (!p) {
        throw new Error(
          `Each request must include a path. Got: ${JSON.stringify(r)}`
        );
      }

      if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) {
        throw new Error(`Invalid method "${method}" for ${p}`);
      }

      out.push({ method, path: p, body });
    }
    return out;
  }

  if (endpointsRaw) {
    const endpoints = endpointsRaw
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean)
      .map((e) => normalizePath(e));

    return endpoints.map((ep) => ({ method: "GET", path: ep, body: null }));
  }

  throw new Error(`Missing arg --requests OR --endpoints`);
}

/**
 * UI runner helpers (NEW)
 *
 * UI Spec format:
 * --uiSpec '[{ "name":"Login", "startPath":"/login", "steps":[ ... ] }]'
 *
 * Supported step types:
 * - goto: { type:"goto", path:"/some" }   (optional if you set startPath)
 * - click: { type:"click", selector:"..." }
 * - fill: { type:"fill", selector:"...", value:"..." }
 * - press: { type:"press", selector:"...", key:"Enter" }
 * - waitFor: { type:"waitFor", selector:"..." } OR { type:"waitFor", ms: 1000 }
 * - expectVisible: { type:"expectVisible", selector:"..." }
 * - expectHidden: { type:"expectHidden", selector:"..." }
 * - expectTextContains: { type:"expectTextContains", selector:"...", value:"..." }
 * - expectUrlContains: { type:"expectUrlContains", value:"/dashboard" }
 * - expectTitleContains: { type:"expectTitleContains", value:"Dashboard" }
 */
function parseUiSpec(uiSpecRaw) {
  const parsed = safeJsonParse(uiSpecRaw, null);
  if (!Array.isArray(parsed)) {
    throw new Error(`--uiSpec must be a JSON array. Got: ${uiSpecRaw}`);
  }

  // Basic validation to fail fast
  for (const t of parsed) {
    if (!t?.name || typeof t.name !== "string") {
      throw new Error(`Each UI test must include a "name" string.`);
    }
    if (!Array.isArray(t?.steps)) {
      throw new Error(`UI test "${t.name}" must include "steps" array.`);
    }
    if (t.startPath && typeof t.startPath !== "string") {
      throw new Error(`UI test "${t.name}" startPath must be a string.`);
    }

    for (const s of t.steps) {
      if (!s?.type) {
        throw new Error(
          `UI test "${t.name}" has a step without "type": ${JSON.stringify(s)}`
        );
      }
    }
  }

  return parsed;
}

const OK_STATUSES = [
  200, 201, 202, 204,
  301, 302, 303, 307, 308,
  400, 401, 403, 405, 409, 422,
];

const mode = (getArg("--mode") || "api").toLowerCase().trim(); // "api" | "ui"

const sessionId = mustGetArg("--session");
const baseUrlInput = mustGetArg("--baseUrl");
const baseUrl = normalizeBaseUrl(baseUrlInput);

const runnerRoot = process.cwd();
const tmpDir = path.join(runnerRoot, "tmp", sessionId);
fs.mkdirSync(tmpDir, { recursive: true });

const reportPath = path.join(tmpDir, "report.json");
const reportRel = path.relative(runnerRoot, reportPath).replace(/\\/g, "/");

const headed = (getArg("--headed") || "false").toLowerCase() === "true";
const workers = getArg("--workers"); // optional
const timeoutMs = Number(getArg("--timeoutMs") || 0); // optional

let specPath;
let specRel;
let runnerError = null;

function runPlaywright(specRelPath) {
  const cmdParts = [
    "npx",
    "playwright",
    "test",
    `"${specRelPath}"`,
    "--config=playwright.config.js",
  ];

  if (headed) cmdParts.push("--headed");
  if (workers) cmdParts.push(`--workers=${workers}`);
  if (timeoutMs > 0) cmdParts.push(`--timeout=${timeoutMs}`);

  const cmd = cmdParts.join(" ");

  try {
    execSync(cmd, {
      cwd: runnerRoot,
      stdio: "inherit",
      env: { ...process.env, PW_JSON_REPORT: reportRel },
    });
  } catch (e) {
    // Playwright returns non-zero exit code when tests fail
    // This is expected - we still want to read the report
    // Only throw if it's a real error (not just test failures)
    console.error(`[RUNNER] Playwright exited with code ${e.status || 'unknown'}`);
  }
}

try {
  if (mode === "api") {
    const requestsRaw = getArg("--requests");
    const endpointsRaw = getArg("--endpoints");

    const headersRaw = getArg("--headers");
    const headersObj = headersRaw ? safeJsonParse(headersRaw, {}) : {};
    if (headersRaw && (typeof headersObj !== "object" || Array.isArray(headersObj))) {
      throw new Error("--headers must be a JSON object");
    }

    const requests = normalizeRequests({ endpointsRaw, requestsRaw });

    specPath = path.join(tmpDir, "api.spec.js");
    specRel = path.relative(runnerRoot, specPath).replace(/\\/g, "/");

    const headersJson = JSON.stringify(headersObj);

    const testFile = `
import { test, expect } from "@playwright/test";

test.describe("TestSphere API Integration", () => {
  test("Base URL reachable", async ({ request }) => {
    const res = await request.get("${baseUrl}");
    const status = res.status();
    expect([200,201,202,204,301,302,303,307,308,400,401,403]).toContain(status);
  });

  const headers = ${headersJson};

  ${requests
    .map((r) => {
      const method = r.method;
      const p = r.path;
      const url = `${baseUrl}${p}`;
      const bodyJson =
        r.body !== null && r.body !== undefined ? JSON.stringify(r.body) : "undefined";
      const hasBody = ["POST", "PUT", "PATCH"].includes(method);
      const fn = method.toLowerCase();

      return `
  test("${method} ${p}", async ({ request }) => {
    const res = await request.${fn}("${url}", {
      headers,
      ${hasBody ? `data: ${bodyJson},` : ``}
    });

    const status = res.status();

    if (status === 404) {
      throw new Error(\`Endpoint not found (404): ${p}\`);
    }

    if (status >= 500) {
      const body = await res.text();
      throw new Error(\`Server error \${status} on ${p}. Body: \${body.slice(0, 300)}\`);
    }

    expect(${JSON.stringify(OK_STATUSES)}).toContain(status);
  });
`;
    })
    .join("")}
});
`;
    fs.writeFileSync(specPath, testFile, "utf8");
    runPlaywright(specRel);
  } else if (mode === "ui") {
    const uiSpecRaw = mustGetArg("--uiSpec");
    const uiSpec = parseUiSpec(uiSpecRaw);

    specPath = path.join(tmpDir, "ui.spec.js");
    specRel = path.relative(runnerRoot, specPath).replace(/\\/g, "/");

    // We generate tests that use Playwright's page (browser)
    const testFile = `
import { test, expect } from "@playwright/test";

const BASE_URL = "${baseUrl}";

function fullUrl(p) {
  if (!p) return BASE_URL;
  if (p.startsWith("http://") || p.startsWith("https://")) return p;
  if (!p.startsWith("/")) p = "/" + p;
  return BASE_URL + p;
}

async function runStep(page, step) {
  const type = step.type;

  if (type === "goto") {
    await page.goto(fullUrl(step.path));
    return;
  }

  if (type === "click") {
    await page.locator(step.selector).click();
    return;
  }

  if (type === "fill") {
    await page.locator(step.selector).fill(String(step.value ?? ""));
    return;
  }

  if (type === "press") {
    await page.locator(step.selector).press(String(step.key ?? "Enter"));
    return;
  }

  if (type === "waitFor") {
    if (typeof step.ms === "number") {
      await page.waitForTimeout(step.ms);
      return;
    }
    if (step.selector) {
      await page.locator(step.selector).waitFor({ state: "visible" });
      return;
    }
    throw new Error("waitFor step needs either {ms} or {selector}");
  }

  if (type === "expectVisible") {
    await expect(page.locator(step.selector)).toBeVisible();
    return;
  }

  if (type === "expectHidden") {
    await expect(page.locator(step.selector)).toBeHidden();
    return;
  }

  if (type === "expectTextContains") {
    const loc = page.locator(step.selector);
    await expect(loc).toContainText(String(step.value ?? ""));
    return;
  }

  if (type === "expectUrlContains") {
    const u = page.url();
    expect(u).toContain(String(step.value ?? ""));
    return;
  }

  if (type === "expectTitleContains") {
    const t = await page.title();
    expect(t).toContain(String(step.value ?? ""));
    return;
  }

  throw new Error("Unsupported step type: " + type);
}

const uiSpec = ${JSON.stringify(uiSpec, null, 2)};

test.describe("TestSphere UI E2E", () => {
  for (const t of uiSpec) {
    test(t.name, async ({ page }) => {
      // Start page
      if (t.startPath) {
        await page.goto(fullUrl(t.startPath));
      }

      // Run steps
      for (const step of t.steps) {
        await runStep(page, step);
      }
    });
  }
});
`;
    fs.writeFileSync(specPath, testFile, "utf8");
    runPlaywright(specRel);
  } else {
    throw new Error(`Invalid --mode "${mode}". Use "api" or "ui".`);
  }
} catch (e) {
  runnerError = String(e);
}

let report = null;
try {
  report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
} catch (e) {
  console.log(
    JSON.stringify({
      ok: false,
      mode,
      report: null,
      runnerError: runnerError || String(e),
    })
  );
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, mode, report, runnerError }));
