 'use client';

import { useEffect, useRef, useState } from "react";
type Props = { onDone?: () => void };

export default function IntroType({ onDone }: Props) {
  const [show, setShow] = useState(false);
  const [text, setText] = useState("");
  const [done, setDone] = useState(false);

  const startRef = useRef<HTMLSpanElement | null>(null);
  const endRef = useRef<HTMLSpanElement | null>(null);
  const lineRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      setShow(true);

      const steps: { out: string; delay: number }[] = [];
      const type = (str: string, speed = 90) => {
        for (let i = 1; i <= str.length; i++) {
          steps.push({ out: str.slice(0, i), delay: speed });
        }
      };

      const phrase1a = "Hi";
      const phrase1b = " there.";
      const full1 = phrase1a + phrase1b;
      const phrase2a = "I'm Bruno.";
      const phrase2b = " Welcome!";
      const full2 = phrase2a + phrase2b;

      // Type "Hi"
      type(phrase1a, 90);
      steps.push({ out: phrase1a, delay: 350 });

      // Then type " there."
      for (let i = 1; i <= phrase1b.length; i++) {
        steps.push({ out: phrase1a + phrase1b.slice(0, i), delay: 90 });
      }
      steps.push({ out: full1, delay: 700 });

      // Erase the whole phrase "Hi there."
      for (let i = full1.length - 1; i >= 0; i--) {
        steps.push({ out: full1.slice(0, i), delay: 55 });
      }
      steps.push({ out: "", delay: 250 });

      // Type "I'm Bruno"
      type(phrase2a, 90);
      steps.push({ out: phrase2a, delay: 500 });

      // Then type "Welcome!"
      for (let i = 1; i <= phrase2b.length; i++) {
        steps.push({ out: phrase2a + phrase2b.slice(0, i), delay: 90 });
      }
      steps.push({ out: full2, delay: 700 });


      let index = 0;
      let timer: number | undefined;

      const run = () => {
        if (index >= steps.length) {
          setDone(true);
          return;
        }
        const step = steps[index++];
        setText(step.out);
        timer = window.setTimeout(run, step.delay);
      };

      timer = window.setTimeout(run, 200);

      return () => {
        if (timer) clearTimeout(timer);
      };
    } catch {
      // on any error, skip the intro (avoid blocking the page)
      setShow(false);
      try { onDone?.(); } catch {}
    }
  }, []);

  // Notify parent when completed
  useEffect(() => {
    if (done) {
      try { onDone?.(); } catch {}
    }
  }, [done, onDone]);

   // LeaderLine: create animated dotted arrow from typed text to "Scroll down"
  useEffect(() => {
    if (!done) return;
    if (typeof window === "undefined") return;
    const startEl = startRef.current;
    const endEl = endRef.current;
    if (!startEl || !endEl) return;
  
    let isMounted = true;
    let line: any = null;
    let cleanup = () => {};
  
    (async () => {
      try {
        const mod: any = await import("leader-line-new");
        const LeaderLine: any = mod?.default ?? mod;
        if (!isMounted) return;
  
        const colorVar =
          getComputedStyle(document.documentElement)
            .getPropertyValue('--color-zinc-500')
            .trim() || '#71717a';
  
        line = new LeaderLine(startEl, endEl, {
          color: colorVar,
          size: 2,
          endPlug: "arrow2",
          startSocket: "bottom",
          endSocket: "top",
          startSocketGravity: [0, 30],
          endSocketGravity: [0, -30],
          path: "straight",
          dash: { len: 2, gap: 5, animation: true }
        });
        (lineRef as any).current = line;
  
        const reposition = () => {
          try { line?.position(); } catch {}
        };
  
        window.addEventListener("scroll", reposition, { passive: true } as any);
  
        // Continuously reposition to follow CSS animations (e.g., bouncing anchor)
        let rafId: number;
        const tick = () => {
          reposition();
          rafId = window.requestAnimationFrame(tick);
        };
        rafId = window.requestAnimationFrame(tick);
  
        // position after layout/fonts settle
        setTimeout(reposition, 0);
  
        cleanup = () => {
          try {
            window.removeEventListener("scroll", reposition as any);
            if (rafId) cancelAnimationFrame(rafId);
            line?.remove?.();
          } catch {}
        };
      } catch {
        // ignore load errors (non-blocking)
      }
    })();
  
    return () => { isMounted = false; cleanup(); };
  }, [done]);

  // Reposition while typing or when intro finishes
  useEffect(() => {
    if ((lineRef as any).current) {
      try { (lineRef as any).current.position(); } catch {}
    }
  }, [text, done]);

  if (!show) return null;

  return (
    <section className="min-h-screen grid place-items-center">
      <div className="flex flex-col items-center gap-5">
        <div className="text-zinc-700 font-rethink tracking-tight text-5xl sm:text-6xl md:text-7xl flex items-center justify-center">
          <div className="inline-block w-auto max-w-max">
            <span aria-live="polite" aria-atomic="true">{text}</span>
            <span aria-hidden className="caret ml-1"></span>
          </div>
        </div>

        <div className={`select-none flex items-center gap-5 transition-opacity duration-500 text-5xl sm:text-6xl md:text-7xl flex-col ${done ? "opacity-100" : "opacity-0"}`}>
          {/* Invisible start anchor (no bounce so the head near text does the motion) */}
          <span ref={startRef} className="block w-0 h-0 pointer-events-none mb-4"></span>

          {/* Visible text + invisible bouncing end anchor (keeps text static) */}
          <div className="relative flex items-center justify-center">
            <span
              ref={endRef}
              className={`${done ? "bounce-subtle" : ""} absolute -top-[0.2rem] left-1/2 -translate-x-1/2 w-0 h-0 pointer-events-none`}
            ></span>
            <span className="text-zinc-500 font-sans text-base sm:text-lg">Scroll down</span>
          </div>
        </div>
      </div>
    </section>
  );
}