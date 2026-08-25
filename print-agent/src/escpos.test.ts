import { describe, expect, it } from "vitest";
import { buildReceiptJob, cutPaper, feed, initPrinter, openCashDrawer, rasterImage } from "./escpos";

describe("escpos byte builders", () => {
  it("builds the standard init/feed/cut/drawer command bytes", () => {
    expect(initPrinter()).toEqual(Buffer.from([0x1b, 0x40]));
    expect(feed(3)).toEqual(Buffer.from([0x1b, 0x64, 3]));
    expect(cutPaper()).toEqual(Buffer.from([0x1d, 0x56, 0x42, 0x00]));
    expect(openCashDrawer()).toEqual(Buffer.from([0x1b, 0x70, 0x00, 0x19, 0xfa]));
  });

  it("rejects a raster width that isn't a multiple of 8", () => {
    expect(() => rasterImage(577, 10, Buffer.alloc(10))).toThrow(/multiple of 8/);
  });

  it("rejects a bitmap whose length doesn't match width x height", () => {
    expect(() => rasterImage(16, 10, Buffer.alloc(5))).toThrow(/does not match/);
  });

  it("frames a raster image with the correct GS v 0 header, little-endian width/height", () => {
    const widthPx = 16; // 2 bytes/row
    const heightPx = 300; // > 255, exercises the two-byte height field
    const bitmap = Buffer.alloc((widthPx / 8) * heightPx, 0xff);
    const framed = rasterImage(widthPx, heightPx, bitmap);
    expect(Array.from(framed.subarray(0, 8))).toEqual([0x1d, 0x76, 0x30, 0x00, 2, 0, 300 & 0xff, (300 >> 8) & 0xff]);
    expect(framed.subarray(8)).toEqual(bitmap);
    expect(framed.length).toBe(8 + bitmap.length);
  });

  it("assembles a full receipt job: init, image, feed, and cut by default", () => {
    const bitmap = Buffer.alloc(1, 0); // widthPx 8 -> 1 byte/row, heightPx 1 -> 1 row
    const job = buildReceiptJob({ widthPx: 8, heightPx: 1, bitmap });
    expect(job.subarray(0, 2)).toEqual(initPrinter());
    expect(job.subarray(-4)).toEqual(cutPaper());
    // init(2) + raster header(8) + bitmap(1) + feed(3) + cut(4)
    expect(job.length).toBe(2 + 8 + 1 + 3 + 4);
  });

  it("skips the cut command when cut: false, and appends the drawer kick when requested", () => {
    const bitmap = Buffer.alloc(1, 0);
    const noCut = buildReceiptJob({ widthPx: 8, heightPx: 1, bitmap, cut: false });
    expect(noCut.subarray(-4)).not.toEqual(cutPaper());

    const withDrawer = buildReceiptJob({ widthPx: 8, heightPx: 1, bitmap, openDrawer: true });
    expect(withDrawer.subarray(-5)).toEqual(openCashDrawer());
  });
});
