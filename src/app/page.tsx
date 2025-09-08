"use client";

import { useState } from "react";
import IntroType from "../components/IntroType";
import ScrollOverlay from "../components/ScrollOverlay";

export default function Home() {
  const [introDone, setIntroDone] = useState(false);
  return (
    <main className="min-h-screen w-full">
      {/* Intro occupies the first screen */}
      <div className="min-h-screen flex items-center justify-center">
        <IntroType onDone={() => setIntroDone(true)} />
      </div>

      {/* Scroll-driven overlay section shows only after intro is done */}
      {introDone && <ScrollOverlay active={introDone} />}
    </main>
  );
}
