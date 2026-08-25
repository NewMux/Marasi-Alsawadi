// Pure ESC/POS byte-command builders — no I/O, fully unit-testable.
// Reference: the printer's own label says "Command Support: ESC/POS", which
// is the de-facto standard command set for thermal receipt printers. These
// specific bytes are the widely-compatible defaults; if cutting or the cash
// drawer don't fire on this exact printer, check its command reference for
// the model-specific variant (see README).

const ESC = 0x1b;
const GS = 0x1d;

export function initPrinter(): Buffer {
  return Buffer.from([ESC, 0x40]); // ESC @ — reset to defaults
}

export function feed(lines: number): Buffer {
  return Buffer.from([ESC, 0x64, lines]); // ESC d n — feed n lines
}

export function cutPaper(): Buffer {
  return Buffer.from([GS, 0x56, 0x42, 0x00]); // GS V B 0 — feed + partial cut
}

export function openCashDrawer(): Buffer {
  return Buffer.from([ESC, 0x70, 0x00, 0x19, 0xfa]); // ESC p 0 25 250 — kick pin 2
}

/**
 * GS v 0 — print a raster bit image.
 * bitmap must be 1-bit-per-pixel, row-major, MSB-first, packed 8 pixels per
 * byte, 1 = black dot. widthPx must be a multiple of 8.
 */
export function rasterImage(widthPx: number, heightPx: number, bitmap: Buffer): Buffer {
  if (widthPx <= 0 || heightPx <= 0) throw new Error("Raster image dimensions must be positive");
  if (widthPx % 8 !== 0) throw new Error("Raster image width must be a multiple of 8 pixels");
  const widthBytes = widthPx / 8;
  if (bitmap.length !== widthBytes * heightPx) {
    throw new Error(`Bitmap length ${bitmap.length} does not match ${widthBytes} bytes/row x ${heightPx} rows`);
  }
  const header = Buffer.from([
    GS, 0x76, 0x30, 0x00,
    widthBytes & 0xff, (widthBytes >> 8) & 0xff,
    heightPx & 0xff, (heightPx >> 8) & 0xff,
  ]);
  return Buffer.concat([header, bitmap]);
}

export type ReceiptJobOptions = {
  widthPx: number;
  heightPx: number;
  bitmap: Buffer;
  cut?: boolean;
  openDrawer?: boolean;
};

/** Assembles the full byte stream for one printed receipt. */
export function buildReceiptJob(options: ReceiptJobOptions): Buffer {
  const parts = [initPrinter(), rasterImage(options.widthPx, options.heightPx, options.bitmap), feed(3)];
  if (options.cut !== false) parts.push(cutPaper());
  if (options.openDrawer) parts.push(openCashDrawer());
  return Buffer.concat(parts);
}
