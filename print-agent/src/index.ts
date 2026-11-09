import "dotenv/config";
import { writeFile } from "node:fs/promises";
import express from "express";
import { buildReceiptJob } from "./escpos.js";
import { pngToMonochrome } from "./image.js";
import { sendToPrinter } from "./printer.js";
import { renderHtmlToPng } from "./render.js";
import { listWindowsPrinters, sendToWindowsPrinter, validatePrinterName } from "./windowsPrinter.js";

const AGENT_PORT = Number(process.env.AGENT_PORT || 7777);
const PRINTER_HOST = process.env.PRINTER_HOST || "";
// Optional: the exact name of a printer installed in Windows (USB, network or
// Bluetooth, any brand). When set it is used INSTEAD of PRINTER_HOST. When it
// is empty the agent behaves exactly as it always has (network printer).
const PRINTER_NAME = (process.env.PRINTER_NAME || "").trim();
const PRINTER_PORT = Number(process.env.PRINTER_PORT || 9100);
const RECEIPT_WIDTH_PX = Number(process.env.RECEIPT_WIDTH_PX || 576); // 576 dots ≈ 72mm printable width on an 80mm printer at 203dpi
const DRY_RUN = process.env.DRY_RUN === "true";
const DEBUG_SAVE_PNG = process.env.DEBUG_SAVE_PNG === "true";

if (!DRY_RUN && !PRINTER_HOST && !PRINTER_NAME) {
  console.error("Set PRINTER_HOST (the printer's LAN IP) or PRINTER_NAME (a printer installed in Windows) in .env, or DRY_RUN=true to test without hardware. See README.md.");
  process.exit(1);
}
if (PRINTER_NAME) {
  if (process.platform !== "win32" && !DRY_RUN) {
    console.error("PRINTER_NAME prints through the Windows print spooler, so it only works on Windows. Use PRINTER_HOST on other systems.");
    process.exit(1);
  }
  try {
    validatePrinterName(PRINTER_NAME);
  } catch (error) {
    console.error(`PRINTER_NAME is not valid: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
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
  const printer = DRY_RUN ? null : PRINTER_NAME ? { windowsPrinter: PRINTER_NAME } : { host: PRINTER_HOST, port: PRINTER_PORT };
  res.json({ ok: true, dryRun: DRY_RUN, printer });
});

// Lists the printers installed in Windows on this PC, so the exact name for
// PRINTER_NAME can be copied. Read-only; changes nothing.
app.get("/printers", async (_req, res) => {
  try {
    res.json({ ok: true, printers: await listWindowsPrinters() });
  } catch (error) {
    res.status(500).json({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
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
    } else if (PRINTER_NAME) {
      await sendToWindowsPrinter(PRINTER_NAME, job);
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
  console.log(DRY_RUN ? "Running in DRY_RUN mode — receipts are saved to last-receipt.bin, not sent to a printer." : PRINTER_NAME ? `Printer target: Windows printer "${PRINTER_NAME}"` : `Printer target: ${PRINTER_HOST}:${PRINTER_PORT}`);
  if (PRINTER_NAME && !DRY_RUN) {
    // A typo in the name would otherwise only show up as a failed print. Warn only — the printer may simply be switched off.
    listWindowsPrinters()
      .then((printers) => {
        if (!printers.some((name) => name.toLowerCase() === PRINTER_NAME.toLowerCase())) {
          console.warn(`WARNING: no Windows printer named "${PRINTER_NAME}" was found. Installed printers: ${printers.length ? printers.map((n) => `"${n}"`).join(", ") : "(none)"}`);
        }
      })
      .catch((error) => console.warn("Could not list Windows printers:", error instanceof Error ? error.message : error));
  }
});
