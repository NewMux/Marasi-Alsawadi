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
    // PRD Round 14, Section 4: "networkidle" only tracks network requests
    // finishing, not font loading/shaping — a fresh Chromium launch (this
    // function's own, every print call) can still be mid-way through
    // loading/shaping a font (the Arabic text especially) when the
    // screenshot fires, which is exactly the kind of thing an OS font
    // cache warming up on its first use would fix on a later print without
    // this actually being any more reliable long-term. Waiting on
    // document.fonts.ready makes every print — first one included — wait
    // for fonts to actually be ready before capturing, instead of hoping
    // the cache happens to be warm by the second attempt.
    await page.evaluate(() => document.fonts.ready);
    const element = await page.$(".ticket");
    if (!element) throw new Error("Rendered receipt HTML has no .ticket element to screenshot");
    return await element.screenshot({ type: "png" });
  } finally {
    await browser.close();
  }
}
