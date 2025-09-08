'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import ProfileSlices from './ProfileSlices';

type Props = {
  active: boolean; // render and enable scrolling only after intro finishes
};

// Utility helpers
const clamp = (v: number, min = 0, max = 1) => Math.min(Math.max(v, min), max);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ramp = (v: number, inStart: number, inEnd: number) => {
  // maps v in [inStart, inEnd] -> [0,1]
  if (inEnd === inStart) return v >= inEnd ? 1 : 0;
  return clamp((v - inStart) / (inEnd - inStart));
};

// Easing helpers for smoother, slower feel
const easeInPow = (t: number, k = 1.5) => Math.pow(clamp(t), k);
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export default function ScrollOverlay({ active }: Props) {
  const [p, setP] = useState(0); // 0..1 progress through the overlay animation
  // Allow extra scroll beyond 1 for a longer slice reveal
  const EXTRA_SLICES_SCROLL = 1.0;
  const MAX_P = 1 + EXTRA_SLICES_SCROLL;
  const SLICE_START = 0.92;
  const touchYRef = useRef<number | null>(null);
  const isCapturingRef = useRef(false);
  const textRef = useRef<HTMLDivElement | null>(null);
  const [vw, setVw] = useState<number>(typeof window !== 'undefined' ? window.innerWidth : 0);
  const [textW, setTextW] = useState<number>(0);
  const moveStartLeftRef = useRef<number | null>(null);
  const lastDyRef = useRef<number>(0);
  const firstSpanRef = useRef<HTMLSpanElement | null>(null);
  const secondSpanRef = useRef<HTMLSpanElement | null>(null);
  const [secondDeltaX, setSecondDeltaX] = useState<number>(0);

  // Lock page scroll while we are animating the overlay
  useEffect(() => {
    if (!active) return;
    const body = document.body;

    const setBodyLocked = (locked: boolean) => {
      if (locked) {
        body.dataset.scrollLock = '1';
        body.style.overflow = 'hidden';
        body.style.touchAction = 'none';
      } else {
        delete body.dataset.scrollLock;
        body.style.overflow = '';
        body.style.touchAction = '';
      }
    };

    // Capturing decision: start capturing on first downward scroll after intro.
    const startCapturingIfNeeded = (deltaY: number) => {
      if (!isCapturingRef.current) {
        if ((p > 0 && p < MAX_P) || (p === 0 && deltaY > 0) || (p === MAX_P && deltaY < 0)) {
          isCapturingRef.current = true;
          setBodyLocked(true);
        }
      }
    };

    const endCapturingIfNeeded = (dy: number) => {
      // Only release when at bounds AND scrolling away from overlay
      // Top bound (p<=0): release on upward scroll (dy < 0)
      if (p <= 0 && dy < 0) {
        isCapturingRef.current = false;
        setBodyLocked(false);
        return;
      }
      // Bottom bound (p>=1): release on downward scroll (dy > 0)
      if (p >= MAX_P && dy > 0) {
        isCapturingRef.current = false;
        setBodyLocked(false);
        return;
      }
      // Otherwise, stay captured
    };

    const applyDelta = (dy: number) => {
      // Normalize wheel delta to progress change.
      // Tune factor for comfortable feel.
  const viewport = Math.max(window.innerHeight, 1);
  // Even slower mapping for a more classic feel
  const factor = 1 / (viewport * 4); // ~160% viewport worth of delta to complete base range
  const next = Math.min(Math.max(p + dy * factor, 0), MAX_P);
      setP(next);
      return next;
    };

    const onWheel = (e: WheelEvent) => {
      // Decide whether we capture this wheel event.
      const viewport = Math.max(window.innerHeight, 1);
      // Normalize delta to pixels across browsers (lines, pages, pixels)
      const pixelDeltaY = e.deltaMode === 1
        ? e.deltaY * 16
        : e.deltaMode === 2
          ? e.deltaY * viewport
          : e.deltaY;
      startCapturingIfNeeded(pixelDeltaY);
      if (isCapturingRef.current) {
        e.preventDefault();
        lastDyRef.current = pixelDeltaY;
        const next = applyDelta(pixelDeltaY);
  if (next <= 0 || next >= MAX_P) endCapturingIfNeeded(pixelDeltaY);
      }
    };

    const onTouchStart = (e: TouchEvent) => {
      touchYRef.current = e.touches[0]?.clientY ?? null;
    };

    const onTouchMove = (e: TouchEvent) => {
      const prevY = touchYRef.current;
      const y = e.touches[0]?.clientY ?? prevY;
      if (prevY == null || y == null) return;
      const dy = prevY - y; // positive when swiping up (scroll down)
      startCapturingIfNeeded(dy);
      if (isCapturingRef.current) {
        e.preventDefault();
        lastDyRef.current = dy;
        const next = applyDelta(dy);
        touchYRef.current = y;
  if (next <= 0 || next >= MAX_P) endCapturingIfNeeded(dy);
      }
    };

    const onTouchEnd = () => {
      touchYRef.current = null;
      endCapturingIfNeeded(lastDyRef.current || 0);
    };

    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('wheel', onWheel as any);
      window.removeEventListener('touchstart', onTouchStart as any);
      window.removeEventListener('touchmove', onTouchMove as any);
      window.removeEventListener('touchend', onTouchEnd as any);
      // Always restore body styles on unmount
      body.style.overflow = '';
      body.style.touchAction = '';
      delete body.dataset.scrollLock;
    };
  }, [active, p]);

  // Track window width for responsive left calculations
  useEffect(() => {
    if (!active) return;
    const onResize = () => setVw(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [active]);

  // Measure text width whenever layout-affecting values change
  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setTextW(rect.width || 0);
  }, [vw, p]);

  // Measure horizontal difference between second and first span (ignoring transforms)
  useLayoutEffect(() => {
    const a = firstSpanRef.current as HTMLElement | null;
    const b = secondSpanRef.current as HTMLElement | null;
    if (!a || !b) return;
    let aLeft = a.offsetLeft;
    let bLeft = b.offsetLeft;
    // Fallback if offsetLeft not reliable
    if ((aLeft === 0 && bLeft === 0) || Number.isNaN(aLeft) || Number.isNaN(bLeft)) {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      aLeft = ra.left;
      bLeft = rb.left;
    }
    setSecondDeltaX(bLeft - aLeft);
  }, [vw, p, textW]);

  if (!active) return null;

  // Base progress for text/rectangle that should saturate at 1
  const baseP = Math.min(p, 1);

  // Rectangle height grows from center: 0 -> 100vh
  // Slightly slower rectangle growth using ease-in
  const rectHeightVh = easeInPow(baseP, 1.3) * 100;
  const rectOpacity = ramp(baseP, 0.0, 0.25); // fade in early

  // Single text group: fade in once rectangle is reasonably tall
  const textOpacity = ramp(baseP, 0.3, 0.65);

  // Compute horizontal slide from centered start to a small left margin
  const moveStart = 0.70;
  // Finish the horizontal slide before the absolute end so users always reach it,
  // and slow the interpolation with easing for a classic feel
  const moveT = easeInPow(ramp(baseP, moveStart, 0.97), 1.8);
  // Targets for final placement (adjustable): left margin and vertical position
  const TARGET_LEFT_VW = 1;  // more to the left
  const TARGET_TOP_VH = 70;  // lower on the viewport
  const leftTargetPx = vw * (TARGET_LEFT_VW / 100);
  // Measure current text width to compute true centered start position
  const measuredWidth = textW;
  const centerLeftPx = Math.max(0, vw * 0.5 - measuredWidth * 0.5);
  // Capture starting X exactly when movement begins to avoid reflow-induced right drift
  useEffect(() => {
    if (moveT > 0 && moveStartLeftRef.current == null) {
      moveStartLeftRef.current = centerLeftPx;
    }
    if (moveT === 0) {
      moveStartLeftRef.current = null;
    }
  }, [moveT, centerLeftPx]);

  const startLeftPx = moveStartLeftRef.current ?? centerLeftPx;
  let leftPx = lerp(startLeftPx, leftTargetPx, moveT);
  // Clamp to target so it never drifts to the right of intended left position
  leftPx = Math.max(leftTargetPx, leftPx);

  // Smoothly transition from single-line look to stacked look without snapping
  // Complete stacking a bit before the end, and slow it down noticeably
  const splitT = easeInPow(ramp(baseP, 0.68, 0.97), 2.0);
  const topDYEm = lerp(0, -0.28, splitT); // first line lifts a bit
  const bottomDYEm = lerp(0, 0.9, splitT); // second line drops under the first
  const mlEm = lerp(0.35, 0, splitT); // remove inline gap as we stack
  
  // Animate vertical position (from screen center to target top)
  const topVh = lerp(50, TARGET_TOP_VH, moveT);

  // Animate font size to fit the target area; inline style overrides tailwind text size
  const START_FONT_VW = 6.5;  // approx initial
  const TARGET_FONT_VW = 12; // final, larger to fill area
  const fontSizeVW = lerp(START_FONT_VW, TARGET_FONT_VW, splitT);
  // Shift second line left toward the first line as we split, so their left edges align
  const secondShiftX = -secondDeltaX * splitT;

  // Sliced profile reveal near the end
  // Spread slice reveal over the extended range for a slower build
  const SLICE_END = MAX_P;
  const revealT = clamp((p - SLICE_START) / (SLICE_END - SLICE_START));

  return (
    // Fixed, full-viewport overlay that captures scroll while animating
    <div className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center">
      {/* Expanding dark zinc rectangle from center */}
      <div
        aria-hidden
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-screen"
        style={{
          height: `${rectHeightVh}vh`,
          background: 'var(--color-zinc-700)', // relatively dark defined in globals.css
          opacity: rectOpacity,
          transition: 'opacity 50ms linear', // tiny smoothing
        }}
      />

      {/* Unified text element that repositions and restacks */}
      <div
        className="absolute max-w-max"
        ref={textRef}
        style={{
          left: `${leftPx}px`,
          opacity: textOpacity,
          top: `${topVh}vh`,
          transform: `translate(0, -50%)`,
          transition: 'opacity 50ms linear',
        }}
      >
        <div
          className={
            `pointer-events-none text-zinc-100 font-rethink tracking-tight leading-[0.95] flex flex-row text-left`
          }
          style={{ whiteSpace: 'nowrap' as const }}
        >
          <span
            ref={firstSpanRef}
            className="text-4xl sm:text-6xl md:text-7xl lg:text-8xl"
            style={{ transform: `translateY(${topDYEm}em)`, willChange: 'transform', fontSize: `${fontSizeVW}vw` }}
          >
            FULL-STACK
          </span>
          {/* Smoothly remove inline gap while dropping the second line */}
          <span
            ref={secondSpanRef}
            className="text-4xl sm:text-6xl md:text-7xl lg:text-8xl"
            style={{
              marginLeft: `${mlEm}em`,
              transform: `translate(${secondShiftX}px, ${bottomDYEm}em)`,
              willChange: 'transform',
              fontSize: `${fontSizeVW}vw`,
            }}
          >
            AI DEVELOPER
          </span>
        </div>
      </div>

      {/* Profile slices reveal near the end; keep text in place */}
      {revealT > 0 && (() => {
        // Place portrait near the top-left; ensure it sits above the text with a small gap
        const PORTRAIT_WIDTH_VW = 26; // larger image
        const TOP_MARGIN_VH = 10; // base distance from viewport top to portrait top
        const GAP_PX = 62; // minimum gap between portrait bottom and text top
        const winH = typeof window !== 'undefined' ? window.innerHeight : 0;
        const portraitPx = (PORTRAIT_WIDTH_VW / 100) * vw; // square, so height = width
        const baseCenterY = winH > 0 ? (TOP_MARGIN_VH / 100) * winH + portraitPx / 2 : 0;
        const textTop = textRef.current?.getBoundingClientRect()?.top ?? null;
        let centerY = baseCenterY;
        if (textTop != null && winH > 0) {
          const maxCenter = textTop - GAP_PX - portraitPx / 2;
          centerY = Math.min(baseCenterY, maxCenter);
        }
        const portraitTopVh = winH > 0 ? (centerY / winH) * 100 : TOP_MARGIN_VH;

        // Content block fixed at top-right of the viewport
        const contentTopVh = 3; // top positioning per request
        const contentRightVw = 2; // right margin
        const contentWidthVw = 46; // desired width
        // Letter-by-letter reveal across two paragraphs with emphasis
        type Seg = { text: string; bold?: boolean };
        const p1: Seg[] = [
          { text: "Hi, I'm Bruno Champion (yes, my last name is kind of peculiar 😅), and I'm a " },
          { text: 'Full-Stack AI Developer', bold: true },
          { text: ' with ' },
          { text: '2 years', bold: true },
          { text: ' of experience in building ' },
          { text: 'complete and functional web apps.', bold: true },
        ];
        const p2: Seg[] = [
          { text: 'I have worked in ' },
          { text: 'large and small projects', bold: true },
          { text: ', within ' },
          { text: 'big teams', bold: true },
          { text: ' composed of various developers, and also ' },
          { text: 'completely by my own.', bold: true },
          { text: ' I strive when finding ' },
          { text: 'creative and innovative solutions', bold: true },
          { text: ' to ' },
          { text: 'software architecture', bold: true },
          { text: ' problems, and also when building ' },
          { text: 'entirely new features', bold: true },
          { text: ' from scratch.' },
        ];
        const totalLen = [...p1, ...p2].reduce((n, s) => n + s.text.length, 0);
        const charCount = Math.floor(totalLen * revealT);
        const sliceSegs = (segs: Seg[], remaining: number) => {
          const vis: React.ReactNode[] = [];
          const hid: React.ReactNode[] = [];
          let left = remaining;
          segs.forEach((s, idx) => {
            const take = Math.max(0, Math.min(s.text.length, left));
            const visTxt = s.text.slice(0, take);
            const hidTxt = s.text.slice(take);
            const Tag: any = s.bold ? 'strong' : 'span';
            const textColor = s.bold ? 'var(--color-zinc-100)' : 'var(--color-zinc-300)';
            if (visTxt) vis.push(<Tag key={`v-${idx}`} style={{ color: textColor }}>{visTxt}</Tag>);
            if (hidTxt) hid.push(<Tag key={`h-${idx}`} className="opacity-0 select-none">{hidTxt}</Tag>);
            left -= take;
          });
          return { vis, hid, used: remaining - left };
        };
        const part1 = sliceSegs(p1, charCount);
        const part2 = sliceSegs(p2, Math.max(0, charCount - part1.used));
        // Buttons fade in quickly over a short portion of the reveal
        const btnOpacity = ramp(revealT, 0.2, 0.35);
        const LINKEDIN_URL = 'https://www.linkedin.com/'; // TODO: set your profile URL
        const EMAIL = 'bruno@example.com'; // TODO: set your email
        return (
          <>
            <ProfileSlices
              t={revealT}
              leftVw={1}
              topVh={portraitTopVh}
              widthVw={PORTRAIT_WIDTH_VW}
              alt={"Bruno's portrait"}
            />
            {/* Blurb + actions at top-right; enable pointer events for buttons */}
            <div
              className="absolute pointer-events-auto text-zinc-100"
              style={{
                right: `${contentRightVw}vw`,
                top: `${contentTopVh}vh`,
                width: `${contentWidthVw}vw`,
                transform: 'translateY(0)',
              }}
            >
              <p className="text-base sm:text-lg md:text-xl leading-relaxed">{part1.vis}{part1.hid}</p>
              <p className="mt-3 text-base sm:text-lg md:text-xl leading-relaxed">{part2.vis}{part2.hid}</p>
              <div className="mt-4 flex items-center gap-3">
                {/* Book a Free Meeting */}
                <a
                  href="#book"
                  className="inline-flex items-center gap-2 rounded-md bg-zinc-100 text-zinc-800 px-3 py-2 text-sm font-medium hover:bg-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-300"
                  style={{ opacity: btnOpacity, transition: 'opacity 120ms linear' }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="16" y1="2" x2="16" y2="6"></line>
                    <line x1="8" y1="2" x2="8" y2="6"></line>
                    <line x1="3" y1="10" x2="21" y2="10"></line>
                  </svg>
                  <span>Book a Free Meeting</span>
                </a>
                {/* LinkedIn icon button with tooltip */}
                <a
                  href={LINKEDIN_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="relative group inline-flex items-center justify-center rounded-md border border-zinc-400/60 p-2 hover:bg-zinc-700"
                  style={{ opacity: btnOpacity, transition: 'opacity 120ms linear' }}
                  aria-label="Go to Bruno's Linkedin"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M4.98 3.5C4.98 4.88 3.86 6 2.5 6S0 4.88 0 3.5 1.12 1 2.5 1s2.48 1.12 2.48 2.5zM0 8h5v16H0V8zm7.5 0h4.8v2.2h.07c.67-1.27 2.3-2.6 4.73-2.6 5.06 0 5.99 3.33 5.99 7.66V24h-5V16.4c0-1.81-.03-4.14-2.52-4.14-2.52 0-2.91 1.97-2.91 4v7.74h-5V8z" />
                  </svg>
                  <span className="pointer-events-none absolute -bottom-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-100 opacity-0 transition-opacity group-hover:opacity-100">Go to Bruno's Linkedin</span>
                </a>
                {/* Mail icon button with tooltip + copy */}
                <button
                  type="button"
                  onClick={() => {
                    try { navigator.clipboard?.writeText(EMAIL); } catch {}
                  }}
                  className="relative group inline-flex items-center justify-center rounded-md border border-zinc-400/60 p-2 hover:bg-zinc-700"
                  style={{ opacity: btnOpacity, transition: 'opacity 120ms linear' }}
                  aria-label="Copy email"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M4 4h16v16H4z"></path>
                    <path d="m22 6-10 7L2 6"></path>
                  </svg>
                  <span className="pointer-events-none absolute -bottom-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-100 opacity-0 transition-opacity group-hover:opacity-100">Copy email</span>
                </button>
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
}
