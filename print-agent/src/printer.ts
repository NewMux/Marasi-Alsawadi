import { Socket } from "node:net";

/** Streams raw ESC/POS bytes to the printer over its network port (9100 is the standard raw-socket port on ESC/POS Ethernet printers). */
export function sendToPrinter(host: string, port: number, payload: Buffer, timeoutMs = 8000): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new Socket();
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`Timed out connecting to printer at ${host}:${port}`));
    }, timeoutMs);

    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    socket.connect(port, host, () => {
      socket.write(payload, (error) => {
        clearTimeout(timer);
        if (error) return reject(error);
        socket.end();
        resolve();
      });
    });
  });
}
