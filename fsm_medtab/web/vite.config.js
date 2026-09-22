import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Studio-managed, do NOT edit base / server.port / server.host / server.hmr.
// The studio injects VITE_BASE / VITE_PORT / VITE_HMR_* per session so the
// preview loads through its per-session proxy (/api/preview/<id>/). Vite does
// NOT read PORT on its own, so we set server.port from the env explicitly.
// If you add config, MERGE keys into this object and leave those untouched.
//
// VITE_BASE applies to the DEV SERVER ONLY. Vite uses base for build output
// too, so letting it through to a build stamps the preview's session-specific
// URL into dist/index.html:
//   <script src="/api/preview/<sessionId>/assets/index-xxx.js">
// In game the page loads as nui://<resource>/web/dist/index.html, that path
// resolves to nui://<resource>/api/preview/… and 404s, no JS or CSS loads, and
// the player gets a black screen. Builds are therefore always relative, which
// is correct everywhere: in game, over http, and from a file.
const previewBase = process.env.VITE_BASE || "/";
const port = Number(process.env.VITE_PORT || process.env.PORT) || undefined;
const hmrClientPort = process.env.VITE_HMR_CLIENT_PORT
  ? Number(process.env.VITE_HMR_CLIENT_PORT)
  : undefined;
const hmrProtocol = process.env.VITE_HMR_PROTOCOL || undefined;
const pollWatch = process.env.VITE_WATCH_POLLING === "1";

export default defineConfig(({ command }) => ({
  // serve = the studio preview, behind its per-session proxy.
  // build  = a resource that has to run from nui://, so relative.
  base: command === "serve" ? previewBase : "./",
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port,
    strictPort: true,
    hmr: previewBase === "/" ? undefined : { clientPort: hmrClientPort, protocol: hmrProtocol },
    // /work is a bind mount, and on a Windows or WSL2 host inotify events do
    // not cross it: the watcher is never told a file changed and vite keeps
    // serving the module it compiled first, so the preview shows a build that
    // no longer exists on disk. The studio sets VITE_WATCH_POLLING where that
    // is the case; on a host whose events do arrive, this stays off and costs
    // nothing.
    watch: pollWatch ? { usePolling: true, interval: 300 } : undefined,
  },
}));
