# Marasi print agent

A small local service that lets the Marasi web app print real, silent,
correctly-cut receipts to the counter's ESC/POS thermal printer (confirmed
hardware: E-POS ECO250, 80mm, Ethernet/USB/Serial, ESC/POS command set).

**This runs on the counter PC — never on Hetzner/Coolify.** It needs to be
on the same local network as the physical printer; the cloud-hosted web app
has no way to reach it. Think of it the same way you'd think of a printer
driver: it lives next to the hardware.

## Why a separate agent, and why does it render an image?

The browser's own print dialog (`window.print()`) still works and is kept
as an automatic fallback — but it pops up a dialog every time, which is
slow at a real counter. This agent skips the dialog and prints instantly.

It also **renders the whole receipt as an image** rather than sending
ESC/POS text commands. That's deliberate, not an accident: thermal printer
firmware fonts are built for Latin/CP437-style text and generally can't
shape Arabic script correctly (Arabic letters change form depending on
their position in a word — plain ESC/POS text mode doesn't handle that).
Rendering with a real browser engine (Chromium, via Playwright) guarantees
the Arabic renders exactly as it does on screen, then the whole thing is
converted to a monochrome image and sent using ESC/POS's raster-image
command, which practically every ESC/POS printer supports.

## One-time setup

### 1. Give the printer a fixed IP

Connect the printer's Ethernet port to the same network as the counter PC.
In your router's settings, reserve a fixed/static IP for it (look up its
MAC address, usually printed on a label, or check the printer's own
network-config printout — most ESC/POS printers can print their current IP
by holding the feed button while powering on; check the printer's manual).
Write that IP down — you'll need it in step 3.

### 2. Install Node.js

Install Node.js 20 or newer on the counter PC: <https://nodejs.org>
(the LTS/"Recommended" installer is fine).

### 3. Install and configure this agent

```
cd print-agent
npm install
cp .env.example .env
```

Open `.env` and set `PRINTER_HOST` to the printer's IP from step 1.

### 4. Make sure Chrome/Edge is installed

The agent uses your installed Chrome or Edge to render receipts (nothing
extra to download in the common case). If neither is installed, either
install Chrome, or run:

```
npx playwright install chromium
```

and set `PRINT_AGENT_CHROME_PATH` in `.env` to the path it prints out.

### 5. Test without printing anything

```
DRY_RUN=true DEBUG_SAVE_PNG=true npm start
```

Then, from the Marasi app, issue a test ticket and click "Print receipt."
The agent writes `last-receipt.png` (what will print) and
`last-receipt.bin` (the exact bytes that would be sent) into this folder
instead of talking to the printer — open the PNG and check it looks right.

### 6. Go live

Set `DRY_RUN=false` in `.env`, then:

```
npm start
```

Issue a real test ticket and confirm it prints and cuts correctly.

### 7. Keep it running automatically

The agent needs to be running whenever the counter PC is in use. The
simplest options:

- **Windows**: create a shortcut to `npm start` (via a small `.bat` file:
  `cd /d C:\path\to\print-agent && npm start`) in the Startup folder
  (`shell:startup`), so it launches when the PC logs in.
- **Any OS**, more robust: install [pm2](https://pm2.keymetrics.io/)
  (`npm install -g pm2`) and run `pm2 start npm --name marasi-print -- start`,
  then `pm2 save` and `pm2 startup` so it survives reboots and restarts
  itself if it crashes.

## Troubleshooting

- **Nothing prints, no error**: confirm `PRINTER_HOST`/`PRINTER_PORT` are
  right and the printer is powered on and on the same network — try
  `ping <PRINTER_HOST>` from the counter PC.
- **Prints, but doesn't cut, or cuts at the wrong point**: the exact cut
  command byte sequence varies slightly between ESC/POS printer families.
  `src/escpos.ts`'s `cutPaper()` uses the widely-compatible `GS V 66 0`
  variant — if this printer needs a different one, check its command
  reference (the label says "Command Support: ESC/POS" — E-POS should be
  able to provide the exact command reference for the ECO250) and adjust
  that one function.
- **Cash drawer doesn't open**: same idea — `openCashDrawer()` in
  `src/escpos.ts` sends the standard pin-2 kick command; adjust the timing
  bytes if this printer's drawer needs different values.
- **Text looks a bit thin/faint on paper**: lower the `threshold` value
  passed to `pngToMonochrome()` in `src/index.ts` (currently 160) — a lower
  number makes more pixels count as black.
- **Browser shows "Local print agent not found"**: the agent isn't
  running, isn't listening on port 7777, or Chrome/Edge isn't installed for
  it to render with — check the agent's terminal output for errors.

## Development

```
npm test    # unit tests for the ESC/POS byte-builder logic (no printer/browser needed)
npm run check  # typecheck
```
