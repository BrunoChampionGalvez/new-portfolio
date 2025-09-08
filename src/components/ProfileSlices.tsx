'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

type Props = {
  t: number; // 0..1 reveal progress
  leftVw: number; // container left in vw
  topVh: number; // container top in vh (centered vertically via translateY(-50%))
  widthVw: number; // container width in vw (height uses aspect-ratio)
  alt?: string;
};

const clamp = (v: number, min = 0, max = 1) => Math.min(Math.max(v, min), max);
const easeInPow = (t: number, k = 1.6) => Math.pow(clamp(t), k);

export default function ProfileSlices({ t, leftVw, topVh, widthVw, alt = "Bruno's portrait" }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(0);
  const [h, setH] = useState(0);

  // Measure container to compute pixel offsets for perfect cropping
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setW(rect.width);
    setH(rect.height);
  }, [leftVw, topVh, widthVw, t]);

  useEffect(() => {
    const onResize = () => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setW(rect.width);
      setH(rect.height);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const slices = 9;
  // Base widths/offsets; we'll normalize horizontally to keep the assembled image centered
  const baseWidths = useMemo(() => [86, 84, 88, 82, 87, 83, 86, 84, 88], []);
  const baseOffsets = useMemo(() => [-4, 4, -5, 5, -6, 3, -4, 4, -5], []);
  // Compute a global shift so the average of (left + width/2) across slices sits at 50%
  const centerShift = useMemo(() => {
    const n = baseWidths.length || 1;
    let sum = 0;
    for (let i = 0; i < n; i++) sum += baseOffsets[i] + baseWidths[i] / 2;
    const avgCenter = sum / n; // in percent
    return 50 - avgCenter; // shift to move average center to 50%
  }, [baseWidths, baseOffsets]);

  // Stagger reveal from top to bottom across t in [0,1]
  const step = 1 / (slices + 1); // leave a little tail to fully settle
  // Build a deterministic shuffled order so the reveal is non-linear but stable across renders
  const order = useMemo(() => {
    const arr = Array.from({ length: slices }, (_, i) => i);
    // Simple deterministic shuffle (Fisher-Yates with a fixed seed)
    let seed = 42;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }, [slices]);

  return (
    <div
      ref={containerRef}
      className="pointer-events-none absolute"
      style={{
        left: `${leftVw}vw`,
        top: `${topVh}vh`,
        transform: 'translate(0,-50%)',
        width: `${widthVw}vw`,
        aspectRatio: '1 / 1', // profile.png is square; adjust if needed
  }}
  role="img"
  aria-label={alt}
    >
      {/* slices wrapper */}
      <div className="relative w-full h-full">
        {Array.from({ length: slices }).map((_, i) => {
          const sliceTop = (i / slices) * h; // px from measured height (for background position)
          const topPct = (i / slices) * 100; // percentage layout independent of measurement
          const heightPct = 100 / slices;
          const widthPctRaw = baseWidths[i % baseWidths.length];
          const offsetPctRaw = baseOffsets[i % baseOffsets.length] + centerShift;
          const dir = i % 2 === 0 ? -1 : 1; // alternate entry side
          // Use shuffled order to determine reveal timing
          const orderIndex = order.indexOf(i);
          const start = orderIndex * step;
          const end = start + step;
          const raw = clamp((t - start) / (end - start));
          const tt = easeInPow(raw, 1.8);
          const travel = Math.max(16, w * 0.03); // px travel
          const x = (1 - tt) * dir * travel;
          const opacity = tt;
          // Clamp slice horizontally to avoid showing beyond image bounds
          const leftPctClamped = Math.max(0, Math.min(100, offsetPctRaw));
          const rightPctClamped = Math.max(0, Math.min(100, offsetPctRaw + widthPctRaw));
          const visibleWidthPct = Math.max(0, rightPctClamped - leftPctClamped);
          const sliceW = `${visibleWidthPct}%`;
          const bgX = Math.round(-(leftPctClamped / 100) * w);
          const bgY = Math.round(-sliceTop);

          return (
            <div
              key={i}
              className="absolute"
              style={{
                top: `${topPct}%`,
                height: `${heightPct}%`,
                width: sliceW,
                left: `${leftPctClamped}%`,
                transform: `translateX(${x}px)`,
                opacity,
                // Draw the thin edge without affecting layout/cropping
                outline: '1px solid var(--color-zinc-700)',
                outlineOffset: 0,
        // Use the full image as a background and position it so only this band's area is visible.
        backgroundImage: "url(/profile.png)",
        backgroundRepeat: 'no-repeat',
        // Size the background to the full measured container so positions are in px.
                backgroundSize: w > 0 && h > 0 ? `${Math.round(w)}px ${Math.round(h)}px` : undefined,
                backgroundPosition: `${bgX}px ${bgY}px`,
        // Ensure any subpixel overflow is clipped (background is inherently clipped to the box).
        overflow: 'hidden',
              }}
            >
      {/* background-based slice; no child content needed */}
            </div>
          );
        })}
      </div>
    </div>
  );
}
