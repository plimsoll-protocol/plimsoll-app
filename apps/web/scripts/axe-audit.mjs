import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const OUT_DIR = path.resolve("out");

const ROUTES = [
  "/",
  "/about/",
  "/asset/",
  "/asset/history/",
  "/asset/certificate/",
  "/badge/",
  "/integrate/",
  "/list/",
  "/mainnet/",
  "/report/",
  "/reporters/",
  "/settings/",
  "/_not-found/",
];

function createStaticServer(dir) {
  return http.createServer((req, res) => {
    let urlPath = req.url.split("?")[0];
    let filePath = path.join(dir, urlPath);

    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, "index.html");
    } else if (!fs.existsSync(filePath) && fs.existsSync(filePath + ".html")) {
      filePath = filePath + ".html";
    }

    if (!fs.existsSync(filePath)) {
      filePath = path.join(dir, "404.html");
    }

    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not Found");
      return;
    }

    const ext = path.extname(filePath);
    const contentTypes = {
      ".html": "text/html",
      ".js": "application/javascript",
      ".css": "text/css",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".json": "application/json",
      ".txt": "text/plain",
    };

    res.writeHead(200, { "Content-Type": contentTypes[ext] || "application/octet-stream" });
    fs.createReadStream(filePath).pipe(res);
  });
}

async function runAudit() {
  const server = createStaticServer(OUT_DIR);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  console.log(`Static server running at ${baseUrl}`);

  const browser = await chromium.launch({ headless: true });
  const allFindings = [];

  for (const theme of ["light", "dark"]) {
    console.log(`\n=== Auditing ${theme.toUpperCase()} MODE ===`);
    const context = await browser.newContext({
      colorScheme: theme,
      viewport: { width: 1280, height: 800 },
    });

    for (const route of ROUTES) {
      const page = await context.newPage();
      try {
        await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle" });
        // Give React a moment to hydrate
        await page.waitForTimeout(300);

        const results = await new AxeBuilder({ page }).analyze();

        for (const v of results.violations) {
          for (const node of v.nodes) {
            allFindings.push({
              theme,
              route,
              rule: v.id,
              impact: v.impact,
              description: v.description,
              help: v.help,
              target: node.target.join(" "),
              html: node.html,
              failureSummary: node.failureSummary,
            });
          }
        }

        const count = results.violations.reduce((sum, v) => sum + v.nodes.length, 0);
        const seriousOrCrit = results.violations
          .filter((v) => v.impact === "serious" || v.impact === "critical")
          .reduce((sum, v) => sum + v.nodes.length, 0);

        console.log(
          `  ${route.padEnd(22)}: ${count} total violations (${seriousOrCrit} serious/critical)`
        );
      } catch (err) {
        console.error(`  Error auditing ${route} (${theme}):`, err.message);
      } finally {
        await page.close();
      }
    }
    await context.close();
  }

  await browser.close();
  server.close();

  console.log("\n=========================================");
  console.log("SUMMARY OF SERIOUS & CRITICAL FINDINGS");
  console.log("=========================================");
  const seriousAndCritical = allFindings.filter(
    (f) => f.impact === "serious" || f.impact === "critical"
  );

  console.log(`Total serious/critical findings: ${seriousAndCritical.length}`);
  for (const f of seriousAndCritical) {
    console.log(`\n[${f.impact.toUpperCase()}] ${f.rule} on ${f.route} (${f.theme})`);
    console.log(`  Help:    ${f.help}`);
    console.log(`  Target:  ${f.target}`);
    console.log(`  HTML:    ${f.html.slice(0, 100)}`);
    if (f.failureSummary) {
      console.log(`  Summary: ${f.failureSummary.split("\n")[0]}`);
    }
  }

  const outName = process.argv[2] || "after_findings.json";
  fs.writeFileSync(
    path.resolve("../../" + outName),
    JSON.stringify(allFindings, null, 2)
  );
  console.log(`\nWrote full findings to ${outName}`);
}

runAudit().catch((err) => {
  console.error("Audit failed:", err);
  process.exit(1);
});
