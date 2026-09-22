import { useEffect, useRef } from "react";
import { cx } from "../lib/ui.js";

/**
 * Live cardiac monitor. A canvas trace sweeps left→right at a fixed paper
 * speed, wiping a small band ahead of the cursor exactly like a real strip.
 *
 * The waveform is sub-sampled in 0.6px steps rather than one segment per
 * animation frame — at 60fps a whole QRS complex is narrower than a single
 * frame, so a per-frame line would flatten the R spike into noise.
 */

const GAUSS = (t, mu, sigma, amp) => amp * Math.exp(-((t - mu) ** 2) / (2 * sigma * sigma));

/** phase 0..1 through one cardiac cycle → deflection -1..1 */
function sampleWaveform(phase, rhythm, noiseSeed) {
  const t = phase - Math.floor(phase);
  if (rhythm === "asystole") {
    return Math.sin(noiseSeed * 41.3) * 0.012 + Math.sin(noiseSeed * 7.7) * 0.008;
  }
  if (rhythm === "vfib") {
    return (
      Math.sin(noiseSeed * 18.2) * 0.34 +
      Math.sin(noiseSeed * 31.7 + 1.2) * 0.22 +
      Math.sin(noiseSeed * 53.1 + 2.6) * 0.14
    );
  }
  // normal PQRST — P, then the QRS complex, then the T wave
  return (
    GAUSS(t, 0.16, 0.023, 0.13) +
    GAUSS(t, 0.3, 0.007, -0.07) +
    GAUSS(t, 0.335, 0.0075, 0.92) +
    GAUSS(t, 0.372, 0.011, -0.26) +
    GAUSS(t, 0.56, 0.038, 0.24) +
    Math.sin(noiseSeed * 23.1) * 0.006
  );
}

export default function ECGMonitor({
  bpm = 72,
  rhythm = "sinus",
  color = "#ff2d55",
  className,
  ariaLabel = "Cardiac monitor trace",
}) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  // live props the animation loop reads, so changing bpm never restarts it
  const liveRef = useRef({ bpm, rhythm, color });
  liveRef.current = { bpm, rhythm, color };

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return undefined;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = 0;
    let height = 0;
    let cursorX = 0;
    let lastY = null;
    let phase = 0;
    let seed = 0;
    let raf = 0;
    let prev = performance.now();

    const PX_PER_SEC = 150;
    const STEP = 0.6;
    const WIPE = 18;

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const nextWidth = Math.max(1, Math.round(rect.width));
      const nextHeight = Math.max(1, Math.round(rect.height));
      // Re-measuring costs the whole trace — the canvas is cleared and the
      // cursor goes back to the left edge. Only pay that when the box really
      // changed, or an observer that fires on every layout pass leaves the
      // monitor permanently blank.
      if (nextWidth === width && nextHeight === height) return;
      width = nextWidth;
      height = nextHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      cursorX = 0;
      lastY = null;
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(wrap);

    const frame = (now) => {
      const dt = Math.min(0.06, (now - prev) / 1000);
      prev = now;
      const { bpm: liveBpm, rhythm: liveRhythm, color: liveColor } = liveRef.current;
      const beatsPerSecond = liveRhythm === "asystole" ? 0 : Math.max(0.1, liveBpm / 60);

      const baseline = height * 0.62;
      const amplitude = height * 0.42;
      const advance = PX_PER_SEC * dt;
      const steps = Math.max(1, Math.ceil(advance / STEP));
      const dx = advance / steps;
      const dPhase = (beatsPerSecond * dt) / steps;

      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      for (let i = 0; i < steps; i += 1) {
        const nextX = cursorX + dx;
        phase += dPhase;
        seed += dx;

        // wipe the band just ahead of the cursor, wrapping at the right edge
        ctx.clearRect(nextX, 0, WIPE, height);
        if (nextX + WIPE > width) ctx.clearRect(0, 0, nextX + WIPE - width, height);

        const y = baseline - sampleWaveform(phase, liveRhythm, seed) * amplitude;

        if (nextX >= width) {
          cursorX = nextX - width;
          lastY = y;
          continue;
        }
        if (lastY !== null) {
          ctx.shadowColor = liveColor;
          ctx.shadowBlur = 9;
          ctx.strokeStyle = liveColor;
          ctx.lineWidth = 1.7;
          ctx.beginPath();
          ctx.moveTo(cursorX, lastY);
          ctx.lineTo(nextX, y);
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
        cursorX = nextX;
        lastY = y;
      }

      // bright head of the trace
      if (lastY !== null) {
        ctx.fillStyle = "#fff";
        ctx.shadowColor = liveColor;
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(cursorX, lastY, 1.9, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      role="img"
      aria-label={ariaLabel}
      className={cx("mt-inset mt-scan relative overflow-hidden rounded-lg", className)}
      style={{
        backgroundImage:
          "linear-gradient(rgba(255,116,168,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,116,168,.08) 1px, transparent 1px), linear-gradient(180deg, rgba(0,0,0,.55), rgba(255,45,85,.05))",
        backgroundSize: "13px 13px, 13px 13px, 100% 100%",
      }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 block" />
    </div>
  );
}
