import { existsSync } from "node:fs";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { listWindowsPrinters, parsePrinterList, RAW_PRINT_SCRIPT, sendToWindowsPrinter, validatePrinterName, type RunCommand } from "./windowsPrinter";

describe("validatePrinterName", () => {
  it("trims a normal name and keeps spaces and symbols", () => {
    expect(validatePrinterName("  Xprinter XP-251B (Copy 1) ")).toBe("Xprinter XP-251B (Copy 1)");
  });
  it("rejects empty, over-long, quoted and control-character names", () => {
    expect(() => validatePrinterName("   ")).toThrow(/empty/);
    expect(() => validatePrinterName("x".repeat(201))).toThrow(/too long/);
    expect(() => validatePrinterName('My "Printer"')).toThrow(/not allowed/);
    expect(() => validatePrinterName("a\nb")).toThrow(/not allowed/);
  });
});

describe("sendToWindowsPrinter", () => {
  it("passes the printer name and data file as arguments (never inside the script) and removes its temp files", async () => {
    const payload = Buffer.from([0x1b, 0x40, 0x41, 0x1d, 0x56, 0x42, 0x00]);
    let seen: { file: string; args: string[]; data: Buffer; script: string } | undefined;
    let scriptPath = "";
    const run: RunCommand = async (file, args) => {
      scriptPath = args[args.indexOf("-File") + 1];
      const dataPath = args[args.length - 1];
      seen = { file, args, data: readFileSync(dataPath), script: readFileSync(scriptPath, "utf8") };
      return { stdout: "" };
    };
    await sendToWindowsPrinter("Xprinter XP-251B", payload, run);
    expect(seen!.file).toBe("powershell.exe");
    expect(seen!.args).toContain("-NoProfile");
    expect(seen!.args[seen!.args.length - 2]).toBe("Xprinter XP-251B");
    expect(seen!.data).toEqual(payload); // bytes reach the spooler untouched
    expect(seen!.script).toContain("MarasiRawPrinter");
    expect(seen!.script).not.toContain("Xprinter");
    expect(existsSync(scriptPath)).toBe(false);
  });

  it("reports the PowerShell error text and still cleans up", async () => {
    let scriptPath = "";
    const run: RunCommand = async (_file, args) => {
      scriptPath = args[args.indexOf("-File") + 1];
      throw Object.assign(new Error("Command failed"), { stderr: "Opening printer 'X' failed (Windows error 1801)\n" });
    };
    await expect(sendToWindowsPrinter("X", Buffer.from([1]), run)).rejects.toThrow(/Windows printer 'X': Opening printer 'X' failed \(Windows error 1801\)/);
    expect(existsSync(scriptPath)).toBe(false);
  });

  it("refuses an invalid name before running anything", async () => {
    let called = false;
    const run: RunCommand = async () => { called = true; return { stdout: "" }; };
    await expect(sendToWindowsPrinter('bad"name', Buffer.from([1]), run)).rejects.toThrow(/not allowed/);
    expect(called).toBe(false);
  });
});

describe("printer list", () => {
  it("parses none, one and several printers", () => {
    expect(parsePrinterList("")).toEqual([]);
    expect(parsePrinterList('"EPOS ECO250"')).toEqual(["EPOS ECO250"]);
    expect(parsePrinterList('["EPOS ECO250","Xprinter XP-251B"]')).toEqual(["EPOS ECO250", "Xprinter XP-251B"]);
  });
  it("lists through PowerShell", async () => {
    const run: RunCommand = async () => ({ stdout: '["A","B"]\r\n' });
    expect(await listWindowsPrinters(run)).toEqual(["A", "B"]);
  });
});

describe("raw print script", () => {
  it("writes in RAW mode and has no here-string terminator problems", () => {
    expect(RAW_PRINT_SCRIPT).toContain('pDataType = "RAW"');
    expect(RAW_PRINT_SCRIPT).toContain("\n'@\n"); // closing of the single-quoted here-string is at the start of a line
    expect(RAW_PRINT_SCRIPT).not.toContain("`");
  });
});
