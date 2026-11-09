import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Runs a program and resolves with its stdout. Injectable so the logic below can be tested without Windows. */
export type RunCommand = (file: string, args: string[]) => Promise<{ stdout: string }>;

const defaultRun: RunCommand = (file, args) => execFileAsync(file, args, { windowsHide: true, timeout: 20000, maxBuffer: 1024 * 1024 });

const POWERSHELL = "powershell.exe";
const POWERSHELL_BASE_ARGS = ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass"];

/**
 * Sends raw bytes to a printer installed in Windows (USB, network or Bluetooth,
 * any brand) through the Windows print spooler in RAW mode — the same thing a
 * POS driver does, so the ESC/POS bytes reach the printer untouched.
 * Uses only what ships with Windows (PowerShell + winspool.drv): no npm native
 * module to build. The printer name and the data file are passed as script
 * ARGUMENTS, never pasted into the script text.
 */
export const RAW_PRINT_SCRIPT = String.raw`param([string]$PrinterName, [string]$DataPath)
$ErrorActionPreference = 'Stop'
try {
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public class MarasiRawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DOCINFO {
    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
  }

  [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  static extern bool OpenPrinter(string name, out IntPtr handle, IntPtr defaults);
  [DllImport("winspool.drv", SetLastError = true)]
  static extern bool ClosePrinter(IntPtr handle);
  [DllImport("winspool.drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  static extern int StartDocPrinter(IntPtr handle, int level, [In] DOCINFO info);
  [DllImport("winspool.drv", SetLastError = true)]
  static extern bool EndDocPrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError = true)]
  static extern bool StartPagePrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError = true)]
  static extern bool EndPagePrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError = true)]
  static extern bool WritePrinter(IntPtr handle, byte[] data, int count, out int written);

  static void Fail(string step) {
    throw new Exception(step + " failed (Windows error " + Marshal.GetLastWin32Error() + ")");
  }

  public static void Send(string printerName, byte[] data) {
    IntPtr handle;
    if (!OpenPrinter(printerName, out handle, IntPtr.Zero)) Fail("Opening printer '" + printerName + "'");
    try {
      DOCINFO info = new DOCINFO();
      info.pDocName = "Marasi receipt";
      info.pOutputFile = null;
      info.pDataType = "RAW";
      if (StartDocPrinter(handle, 1, info) == 0) Fail("StartDocPrinter");
      try {
        if (!StartPagePrinter(handle)) Fail("StartPagePrinter");
        int written;
        if (!WritePrinter(handle, data, data.Length, out written)) Fail("WritePrinter");
        if (written != data.Length) throw new Exception("Only " + written + " of " + data.Length + " bytes were accepted by the spooler");
        EndPagePrinter(handle);
      } finally {
        EndDocPrinter(handle);
      }
    } finally {
      ClosePrinter(handle);
    }
  }
}
'@
  [MarasiRawPrinter]::Send($PrinterName, [System.IO.File]::ReadAllBytes($DataPath))
} catch {
  [Console]::Error.WriteLine($_.Exception.Message)
  exit 1
}
`;

/** A Windows printer name is passed as an argument, but still reject anything that can't be a real name (empty, control characters, quotes). */
export function validatePrinterName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Printer name is empty");
  if (trimmed.length > 200) throw new Error("Printer name is too long");
  if (/[\u0000-\u001f"]/.test(trimmed)) throw new Error("Printer name contains characters that are not allowed");
  return trimmed;
}

export async function sendToWindowsPrinter(printerName: string, payload: Buffer, run: RunCommand = defaultRun): Promise<void> {
  const name = validatePrinterName(printerName);
  const dir = await mkdtemp(join(tmpdir(), "marasi-print-"));
  try {
    const scriptPath = join(dir, "raw-print.ps1");
    const dataPath = join(dir, "job.bin");
    // A UTF-8 BOM makes Windows PowerShell 5.1 read the script as UTF-8 rather than the ANSI code page.
    await writeFile(scriptPath, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(RAW_PRINT_SCRIPT, "utf8")]));
    await writeFile(dataPath, payload);
    try {
      await run(POWERSHELL, [...POWERSHELL_BASE_ARGS, "-File", scriptPath, name, dataPath]);
    } catch (error) {
      const stderr = (error as { stderr?: string }).stderr?.trim();
      throw new Error(`Windows printer '${name}': ${stderr || (error instanceof Error ? error.message : String(error))}`);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** PowerShell's ConvertTo-Json gives a bare string for one printer and an array for several (and nothing for none). */
export function parsePrinterList(stdout: string): string[] {
  const text = stdout.trim();
  if (!text) return [];
  const parsed: unknown = JSON.parse(text);
  const list = Array.isArray(parsed) ? parsed : [parsed];
  return list.filter((item): item is string => typeof item === "string" && item.length > 0);
}

export async function listWindowsPrinters(run: RunCommand = defaultRun): Promise<string[]> {
  const command = "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; @(Get-CimInstance Win32_Printer | ForEach-Object { $_.Name }) | ConvertTo-Json -Compress";
  const { stdout } = await run(POWERSHELL, [...POWERSHELL_BASE_ARGS, "-Command", command]);
  return parsePrinterList(stdout);
}
