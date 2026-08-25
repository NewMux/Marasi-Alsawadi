import "dotenv/config";
import { writeFile } from "node:fs/promises";
import express from "express";
import { buildReceiptJob } from "./escpos.js";
import { pngToMonochrome } from "./image.js";
import { sendToPrinter } from "./printer.js";
import { renderHtmlToPng } from "./render.js";

const AGENT_PORT = Number(process.env.AGENT_PORT || 7777);
const PRINTER_HOST = process.env.PRINTER_HOST || "";
const PRINTER_PORT = Number(process.env.PRINTER_PORT || 9100);
const RECEIPT_WIDTH_PX = Number(process.env.RECEIPT_WIDTH_PX || 576); // 576 dots ≈ 72mm printable width on an 80mm printer at 203dpi
const DRY_RUN = process.env.DRY_RUN === "true";
const DEBUG_SAVE_PNG = process.env.DEBUG_SAVE_PNG === "true";

if (!DRY_RUN && !PRINTER_HOST) {
  console.error("Set PRINTER_HOST (the printer's LAN IP) in .env, or DRY_RUN=true to test without hardware. See README.md.");
  process.exit(1);
}

const app = express();
app.use(express.json({ limit: "5mb" }));

// The web app is served over HTTPS from a different origin than this local
// agent; browsers treat http://127.0.0.1 as "potentially trustworthy" (no
// mixed-content block) but still enforce CORS, so this needs an explicit
// allow-all — the agent only ever accepts a receipt to print, nothing
// sensitive, and it only listens on localhost.
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, dryRun: DRY_RUN, printer: DRY_RUN ? null : { host: PRINTER_HOST, port: PRINTER_PORT } });
});

app.post("/print", async (req, res) => {
  const { html, cut, openDrawer } = req.body ?? {};
  if (typeof html !== "string" || !html.includes("class=\"ticket\"")) {
    return res.status(400).json({ ok: false, error: "Request body must include { html } containing the rendered .ticket markup" });
  }
  try {
    const png = await renderHtmlToPng(html, RECEIPT_WIDTH_PX);
    if (DEBUG_SAVE_PNG) await writeFile("last-receipt.png", png);
    const { widthPx, heightPx, bitmap } = await pngToMonochrome(png, RECEIPT_WIDTH_PX);
    const job = buildReceiptJob({ widthPx, heightPx, bitmap, cut: cut !== false, openDrawer: Boolean(openDrawer) });

    if (DRY_RUN) {
      await writeFile("last-receipt.bin", job);
      console.log(`[dry-run] Wrote ${job.length} bytes to last-receipt.bin instead of sending to a printer.`);
    } else {
      await sendToPrinter(PRINTER_HOST, PRINTER_PORT, job);
    }
    res.json({ ok: true, bytes: job.length });
  } catch (error) {
    console.error("Print job failed:", error);
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});

app.listen(AGENT_PORT, "127.0.0.1", () => {
  console.log(`Marasi print agent listening on http://127.0.0.1:${AGENT_PORT}`);
  console.log(DRY_RUN ? "Running in DRY_RUN mode — receipts are saved to last-receipt.bin, not sent to a printer." : `Printer target: ${PRINTER_HOST}:${PRINTER_PORT}`);
});
