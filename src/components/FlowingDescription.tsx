"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

export type FlowSlot = {
  leftVw: number;
  topVh: number;
  widthVw: number;
  heightVh: number;
  maxLines?: number; // optional cap to force flowing into later slots
};

type Props = {
  text: string; // full plain text (we can derive readable order from slots)
  revealT: number; // 0..1 progressive character reveal
  slots: FlowSlot[];
  className?: string; // font + color styling
  lineHeight?: number; // em
  highlightWords?: string[]; // words (case-insensitive) to emphasize
  highlightColor?: string; // CSS color for highlights
  autoSize?: boolean; // grow font to fill allotted area
  minFontPx?: number; // lower bound when autoSize
  maxFontPx?: number; // upper bound when autoSize
  targetFillRatio?: number; // ratio (0-1) of line capacity we try to reach before stopping growth
  collapseToSingle?: boolean; // if true (default) merge provided slots into one encompassing slot
  forcedBreakWordIndices?: number[]; // sorted list of word indices at which a new slot must begin (e.g., [p1WordCount])
  slotTexts?: string[]; // Independent per-slot text. If provided (length === slots.length) words never flow between slots.
};

// Splits into words while keeping punctuation attached to the preceding word for better wrapping.
const splitWords = (s: string) => s.split(/\s+/).filter(Boolean);

// Fallback responsive size when autoSize is off
const BASE_FONT_SIZE_CSS = "clamp(20px,2.0vw,50px)"; // slightly larger per request

export default function FlowingDescription({
  text,
  revealT,
  slots,
  className = "",
  lineHeight = 1.15,
  highlightWords = [],
  highlightColor = 'var(--color-zinc-200)',
  autoSize = true,
  minFontPx = 55,
  maxFontPx = 60,
  targetFillRatio = 0.88,
  collapseToSingle = true,
  forcedBreakWordIndices,
  slotTexts,
}: Props) {
  const measureRef = useRef<HTMLSpanElement | null>(null);
  const [linesPerSlot, setLinesPerSlot] = useState<string[][]>(() => slots.map(() => []));
  const [fontSizePx, setFontSizePx] = useState<number>(16);

  const independentMode = Array.isArray(slotTexts) && slotTexts.length === slots.length;
  const words = useMemo(() => independentMode ? splitWords(text) : splitWords(text), [text, independentMode]);
  // For independent mode maintain separate word lists
  const slotWordLists = useMemo(() => independentMode ? slotTexts!.map(t => splitWords(t)) : [], [independentMode, slotTexts]);

  // Merge slots into a single bounding slot if requested
  const effectiveSlots = useMemo(() => {
    if (independentMode) return slots; // never merge when independent
    if (!collapseToSingle || slots.length <= 1) return slots;
    const left = Math.min(...slots.map(s => s.leftVw));
    const top = Math.min(...slots.map(s => s.topVh));
    const right = Math.max(...slots.map(s => s.leftVw + s.widthVw));
    const bottom = Math.max(...slots.map(s => s.topVh + s.heightVh));
    return [{ leftVw: left, topVh: top, widthVw: right - left, heightVh: bottom - top }];
  }, [slots, collapseToSingle, independentMode]);

  const recalc = useCallback(() => {
    if (typeof window === "undefined") return;
    const meas = measureRef.current;
    if (!meas) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Helper to layout text for a given font size; returns lines & stats
    const layoutAt = (sizePx: number) => {
      meas.style.fontSize = sizePx + "px";
      const lines: string[][] = [];
      let capacityTotal = 0;
      let usedLinesTotal = 0;
      if (independentMode) {
        // Each slot isolated
        for (let sIdx = 0; sIdx < effectiveSlots.length; sIdx++) {
          const slot = effectiveSlots[sIdx];
          const slotWords = slotWordLists[sIdx];
          let idx = 0;
          const slotPxW = (slot.widthVw / 100) * vw;
          const slotPxH = (slot.heightVh / 100) * vh;
          const capLines = Math.max(1, Math.floor(slotPxH / (sizePx * lineHeight)));
          const maxLines = slot.maxLines ? Math.min(capLines, slot.maxLines) : capLines;
          capacityTotal += maxLines;
          const slotLines: string[] = [];
          let current = "";
          while (idx < slotWords.length && slotLines.length < maxLines) {
            const nextWord = slotWords[idx];
            const tentative = current ? current + " " + nextWord : nextWord;
            meas.textContent = tentative;
            if (meas.offsetWidth <= slotPxW) {
              current = tentative;
              idx++;
            } else {
              if (current) {
                slotLines.push(current);
                current = "";
              } else {
                slotLines.push(nextWord);
                idx++;
              }
            }
          }
          if (current && slotLines.length < maxLines) slotLines.push(current);
          usedLinesTotal += slotLines.length;
          lines[sIdx] = slotLines;
          if (idx < slotWords.length) {
            // overflow => mark not all words fit by returning flag below
            return { lines, allWordsFit: false, fillRatio: usedLinesTotal / Math.max(1, capacityTotal), sizePx };
          }
        }
        const fillRatioInd = usedLinesTotal / Math.max(1, capacityTotal);
        return { lines, allWordsFit: true, fillRatio: fillRatioInd, sizePx };
      }

      // Flow mode (original behavior)
      let wIdx = 0;
      const breaks = (forcedBreakWordIndices || []).slice().sort((a,b)=>a-b);
      effectiveSlots.forEach((slot, sIdx) => {
        const slotPxW = (slot.widthVw / 100) * vw;
        const slotPxH = (slot.heightVh / 100) * vh;
        const capLines = Math.max(1, Math.floor(slotPxH / (sizePx * lineHeight)));
        const maxLines = slot.maxLines ? Math.min(capLines, slot.maxLines) : capLines;
        capacityTotal += maxLines;
        const slotLines: string[] = [];
        let current = "";
        const wordLimit = breaks[sIdx] ?? Infinity; // exclusive upper bound for this slot
        while (wIdx < words.length && slotLines.length < maxLines) {
          if (wIdx >= wordLimit) break; // force move to next slot
          const nextWord = words[wIdx];
          const tentative = current ? current + " " + nextWord : nextWord;
          meas.textContent = tentative;
          if (meas.offsetWidth <= slotPxW) {
            current = tentative;
            wIdx++;
          } else {
            if (current) {
              slotLines.push(current);
              current = "";
            } else {
              slotLines.push(nextWord); // force long single word
              wIdx++;
            }
          }
        }
        if (current && slotLines.length < maxLines) slotLines.push(current);
        usedLinesTotal += slotLines.length;
        lines[sIdx] = slotLines;
      });
  const allWordsFit = words.length === wIdx;
  const fillRatio = usedLinesTotal / Math.max(1, capacityTotal);
  return { lines, allWordsFit, fillRatio, sizePx };
    };

    if (!autoSize) {
      // Single pass at current computed size (from CSS clamp fallback)
      const defaultSize = parseFloat(getComputedStyle(meas).fontSize) || minFontPx;
  const { lines } = layoutAt(defaultSize);
      setFontSizePx(defaultSize);
      setLinesPerSlot(lines);
      return;
    }

    // Incrementally grow until we either overflow or hit fill target
    let best = layoutAt(minFontPx);
    for (let sz = minFontPx + 1; sz <= maxFontPx; sz += 1) {
      const attempt = layoutAt(sz);
      if (!attempt.allWordsFit) break; // can't go larger
      best = attempt;
      if (attempt.fillRatio >= targetFillRatio) break; // filled enough
    }
    setFontSizePx(best.sizePx);
    setLinesPerSlot(best.lines);
  }, [effectiveSlots, words, lineHeight, autoSize, minFontPx, maxFontPx, targetFillRatio, forcedBreakWordIndices, independentMode, slotWordLists]);

  // Recalculate on mount & resize
  useLayoutEffect(() => {
    recalc();
    const onR = () => recalc();
    window.addEventListener("resize", onR);
    return () => window.removeEventListener("resize", onR);
  }, [recalc]);

  // Progressive character reveal across all produced lines in order of slots
  const allText = useMemo(() => linesPerSlot.flat().join("\n"), [linesPerSlot]);
  const totalChars = allText.length;
  const visibleChars = Math.floor(totalChars * revealT);

  let remaining = visibleChars;
  const highlightSet = useMemo(() => new Set(highlightWords.map(w => w.toLowerCase())), [highlightWords]);
  const renderHighlighted = (line: string) => {
    const tokens = line.split(/(\s+)/);
    return tokens.map((tok, i) => {
      if (/^\s+$/.test(tok) || tok === '') return <span key={i} style={{ fontWeight: 600 }}>{tok}</span>;
      const plain = tok.replace(/[.,!?:;]+$/g, '').toLowerCase();
      if (highlightSet.has(plain)) {
        return <strong key={i} style={{ color: highlightColor, fontWeight: 600 }}>{tok}</strong>;
      }
      return <span key={i} style={{ fontWeight: 600 }}>{tok}</span>;
    });
  };
  const rendered = linesPerSlot.map((slotLines, sIdx) => {
    return slotLines.map((line, lIdx) => {
      const take = Math.max(0, Math.min(line.length, remaining));
      const vis = line.slice(0, take);
      const hid = line.slice(take);
      remaining -= take;
      return (
        <div key={`l-${sIdx}-${lIdx}`} aria-hidden style={{ opacity: vis ? 1 : 0.04, transition: 'opacity 250ms linear' }}>
          <span>{renderHighlighted(vis)}</span>
          {hid && <span className="opacity-0 select-none">{hid}</span>}
        </div>
      );
    });
  });

  return (
    <>
      {/* Hidden measurer */}
      <span
        ref={measureRef}
        className="fixed -top-[200vh] -left-[200vw] pointer-events-none whitespace-pre font-inter font-semibold"
        // If autoSize enabled we set px directly; otherwise use responsive clamp
        style={{ fontSize: autoSize ? fontSizePx : BASE_FONT_SIZE_CSS, lineHeight, fontWeight: 600 }}
      />
      {/* Visually rendered slots */}
  {effectiveSlots.map((slot, i) => (
        <div
          key={i}
          className={`absolute ${className}`}
          style={{
            left: `${slot.leftVw}vw`,
            top: `${slot.topVh}vh`,
            width: `${slot.widthVw}vw`,
            height: `${slot.heightVh}vh`,
            fontSize: autoSize ? fontSizePx : BASE_FONT_SIZE_CSS,
            lineHeight,
            overflow: "hidden",
            fontWeight: 600,
          }}
        >
          {rendered[i]}
        </div>
      ))}
      {/* Screen reader single flow (full text) */}
      <p className="sr-only">{text}</p>
    </>
  );
}
