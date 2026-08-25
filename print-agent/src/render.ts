import { chromium } from "playwright-core";

// A real browser engine is used deliberately, not a hand-rolled text
// renderer: the receipt is bilingual (Arabic + English) and thermal-printer
// firmware fonts generally can't shape/join Arabic script correctly, so the
// whole ticket is rendered as one image instead. Chromium handles the
// Arabic shaping, bidi layout, and emoji exactly like the on-screen preview.
export async function renderHtmlToPng(html: string, widthPx: number): Promise<Buffer> {
  const executablePath = process.env.PRINT_AGENT_CHROME_PATH || undefined;
  const browser = await chromium.launch({
    executablePath,
    channel: executablePath ? undefined : "chrome",
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage({ viewport: { width: widthPx, height: 100 } });
    await page.setContent(html, { waitUntil: "networkidle" });
    const element = await page.$(".ticket");
    if (!element) throw new Error("Rendered receipt HTML has no .ticket element to screenshot");
    return await element.screenshot({ type: "png" });
  } finally {
    await browser.close();
  }
}
