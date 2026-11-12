import { useEffect } from 'react';

const DURATION_MS = 1500;
const COLORS = ['#2f7df6', '#f6b72f', '#e5484d', '#30a46c', '#8e4ec6', '#12a594'];

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
}

/** Fires a short confetti burst on a throwaway full-screen canvas. Returns false when skipped. */
export function fireConfetti(): boolean {
  if (typeof document === 'undefined' || reducedMotion()) return false;
  const canvas = document.createElement('canvas');
  canvas.setAttribute('data-testid', 'confetti');
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '9999' });
  const w = (canvas.width = window.innerWidth || 360);
  const h = (canvas.height = window.innerHeight || 640);
  document.body.appendChild(canvas);

  let done = false;
  let raf = 0;
  const finish = () => {
    if (done) return;
    done = true;
    if (raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
    canvas.remove();
  };
  setTimeout(finish, DURATION_MS + 100);

  const ctx = canvas.getContext?.('2d') ?? null;
  if (!ctx || typeof requestAnimationFrame !== 'function') return true;

  const pieces = Array.from({ length: 120 }, () => ({
    x: w / 2 + (Math.random() - 0.5) * w * 0.3,
    y: h * 0.35,
    vx: (Math.random() - 0.5) * 14,
    vy: -Math.random() * 14 - 4,
    size: 5 + Math.random() * 6,
    rot: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.4,
    color: COLORS[Math.floor(Math.random() * COLORS.length)]!,
  }));
  const start = performance.now();
  const frame = (now: number) => {
    if (done) return;
    const t = now - start;
    if (t >= DURATION_MS) return finish();
    ctx.clearRect(0, 0, w, h);
    ctx.globalAlpha = Math.min(1, (DURATION_MS - t) / 500);
    for (const p of pieces) {
      p.vy += 0.35;
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.99;
      p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return true;
}

/** Declarative form: fires once when `run` becomes true. */
export function Confetti({ run }: { run: boolean }) {
  useEffect(() => {
    if (run) fireConfetti();
  }, [run]);
  return null;
}
