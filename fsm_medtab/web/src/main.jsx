import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

// ── STUDIO-MANAGED: asset base-path bridge, do NOT remove ──────────────────
// Every public asset (texture, backdrop, font, item art) MUST be resolved to an
// ABSOLUTE url through ABS_BASE below, then exposed as a CSS custom property.
// WHY absolute: a RELATIVE url() (e.g. "./tex/x.png") stored in a CSS variable
// does NOT resolve once it is substituted via var() into mask-image /
// background, it renders BLANK in Chrome AND the in-game CEF, even though the
// exact same relative path works in a plain <img src> or an @font-face rule
// (the classic "fonts + item <img> load but textures/parchment stay empty"
// bug). Also never hardcode ROOT-ABSOLUTE "/tex/…" paths: they ignore the
// preview's per-session base and 404. ABS_BASE (BASE resolved against
// document.baseURI) is correct in EVERY context: the studio preview proxy, the
// exported dist (relative "./" base) and in-game (nui://). ADD a tex() /
// fsmAsset() line here for every asset you pull into web/public/.
const BASE = import.meta.env.BASE_URL;
const ABS_BASE = new URL(BASE, document.baseURI).href;
const tex = (p) => `url("${ABS_BASE}${p}")`;
// Item art shown AS-IS in <img src> (never masked): src={fsmAsset("tex/items/x.png")}.
// @font-face url() must also use ABS_BASE (it cannot read a CSS var).
const fsmAsset = (p) => ABS_BASE + p;
window.fsmAsset = fsmAsset;
const root = document.documentElement.style;
// Cinematic scene backdrop (the studio drops a fitting scene here).
root.setProperty("--fsm-backdrop", tex("img/backdrop.jpg"));

// NUI GATE, in-game the UI starts HIDDEN and only appears when the client
// sends SendNUIMessage({ action: "open" }); in the studio preview / a normal
// browser it shows immediately (env-browser detection). Wire client.lua to
// this: open → SetNuiFocus(true,true) + SendNUIMessage open; the UI closes
// via window.fsmNui.close() which posts the "close" NUI callback so the
// client can SetNuiFocus(false,false).
const IS_GAME =
  typeof window.invokeNative !== "undefined" ||
  /CitizenFX/i.test(navigator.userAgent);
if (IS_GAME) {
  // fsm-ingame: the CSS keeps the page TRANSPARENT in-game (game shows
  // through) and only paints the full backdrop while a panel is open
  // (fsm-open), so the resource can never black out the game on start.
  document.documentElement.classList.add("fsm-ingame");
  document.documentElement.style.visibility = "hidden";
  window.addEventListener("message", (e) => {
    const a = e && e.data && e.data.action;
    if (a === "open" || a === "show") {
      document.documentElement.style.visibility = "visible";
      document.documentElement.classList.add("fsm-open");
    }
    if (a === "close" || a === "hide") {
      document.documentElement.style.visibility = "hidden";
      document.documentElement.classList.remove("fsm-open");
    }
  });
}
window.fsmNui = {
  isGame: IS_GAME,
  post(name, data) {
    if (!IS_GAME) return Promise.resolve();
    const res =
      typeof GetParentResourceName === "function" ? GetParentResourceName() : "nui-resource";
    return fetch("https://" + res + "/" + name, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data || {}),
    }).catch(() => {});
  },
  close() {
    if (IS_GAME) {
      document.documentElement.style.visibility = "hidden";
      document.documentElement.classList.remove("fsm-open");
    }
    return window.fsmNui.post("close");
  },
};
// ── end STUDIO-MANAGED ──────────────────────────────────────────────────────

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
