import { Jimp } from "jimp";

export type MonochromeBitmap = { widthPx: number; heightPx: number; bitmap: Buffer };

/**
 * Loads a PNG, scales it to targetWidthPx (rounded up to a multiple of 8 —
 * required by the ESC/POS raster format), converts to greyscale, and
 * thresholds every pixel to black/white. Returns a 1-bit-per-pixel,
 * MSB-first, row-major buffer ready for escpos.rasterImage().
 *
 * Thresholding (not dithering) is deliberate: this image is mostly crisp
 * black text/lines on a white background, not a photo, so a hard cutoff
 * prints sharper than a dithered gradient would on a 203dpi thermal head.
 */
export async function pngToMonochrome(png: Buffer, targetWidthPx: number, threshold = 160): Promise<MonochromeBitmap> {
  const widthPx = Math.ceil(targetWidthPx / 8) * 8;
  const image = await Jimp.read(png);
  image.resize({ w: widthPx });
  image.greyscale();

  const heightPx = image.bitmap.height;
  const { data } = image.bitmap; // RGBA, 4 bytes/pixel, row-major
  const widthBytes = widthPx / 8;
  const bitmap = Buffer.alloc(widthBytes * heightPx, 0);

  for (let y = 0; y < heightPx; y += 1) {
    for (let x = 0; x < widthPx; x += 1) {
      const pixelIndex = (y * widthPx + x) * 4;
      const grey = data[pixelIndex];
      const alpha = data[pixelIndex + 3];
      // Transparent or light pixels stay white (bit 0); dark, opaque pixels become black dots (bit 1).
      const isBlack = alpha > 32 && grey < threshold;
      if (isBlack) {
        const byteIndex = y * widthBytes + (x >> 3);
        bitmap[byteIndex] |= 0x80 >> (x & 7);
      }
    }
  }

  return { widthPx, heightPx, bitmap };
}
