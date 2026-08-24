# Fingering Trainer — MIDI Score Viewer prototype

React + Vite app. MIDI parsing (`@tonejs/midi`) and notation rendering
(`vexflow`) are both installed as local npm packages and bundled by Vite —
no CDN calls at runtime, so it works fully offline once built.

## One-time setup (needs network)

```bash
npm install
```

This is the only step that requires internet access — it downloads the
dependencies into `node_modules`.

## Develop

```bash
npm run dev
```

Opens a local dev server. Still needs network for the dev server's hot
module reload assets on first load in some setups, but no external CDN
calls are made — everything comes from `node_modules`.

## Build for offline / production use

```bash
npm run build
npm run preview
```

`npm run build` produces a fully self-contained `dist/` folder:
- all JS/CSS bundled and hashed
- a service worker (via `vite-plugin-pwa`) that pre-caches every build
  asset on first load
- a `manifest.json` so the browser can offer "Add to Home Screen" /
  "Install app"

After the **first visit** with network on, the service worker caches
everything. From then on the app opens and works with **zero
connectivity** — including offline MIDI file parsing and score
rendering, since both happen entirely client-side already.

## Before shipping

- Replace `public/icon-192.png` and `public/icon-512.png` (referenced in
  `vite.config.js`'s manifest) with real app icons — placeholders aren't
  included in this scaffold.
- Serve `dist/` from any static host, or wrap it with
  [Capacitor](https://capacitorjs.com/) if you need native device access
  (Web MIDI port selection, Bluetooth/Serial for the ESP32 sensor input)
  beyond what a browser PWA sandbox allows.

## Project layout

```
index.html          entry HTML
src/main.jsx         React bootstrap
src/App.jsx           file upload, track select, MIDI parse, VexFlow render
src/App.css           styling
vite.config.js        build + PWA/service-worker config
public/favicon.svg    icon
```
