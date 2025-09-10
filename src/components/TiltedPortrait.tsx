'use client';

import Image from 'next/image';
import React from 'react';

type Props = {
  t?: number; // optional reveal progress 0..1
  leftVw?: number;
  topVh?: number; // vertical center when provided
  widthVw: number; // square
  alt?: string;
};

const clamp = (v: number, min = 0, max = 1) => Math.min(Math.max(v, min), max);
const easeInPow = (t: number, k = 1.6) => Math.pow(clamp(t), k);

export default function TiltedPortrait({ t = 1, leftVw, topVh, widthVw, alt = "Bruno's portrait" }: Props) {
  const opacity = easeInPow(t, 1.4);
  return (
    <div
      className="pointer-events-none absolute"
      style={{
        width: `${widthVw}vw`,
        aspectRatio: '1 / 1',
        left: leftVw != null ? `${leftVw}vw` : undefined,
        top: '4vh',
        transition: 'opacity 120ms linear',
        opacity,
      }}
      role="img"
      aria-label={alt}
    >
      {/* Foreground photo card */}
        <div
        className="absolute inset-0 overflow-hidden shadow-lg"
        style={{
            zIndex: 1,
            backgroundColor: 'white',
            borderRadius: '5px',
        }}
        >
        <Image
            src="/profile.png"
            alt={alt}
            fill
            className="w-[110%] h-[110%]"
            style={{
            transform: `scale(1.02)`,
            transformOrigin: 'center',
            }}
            priority
        />
        </div>
    </div>
  );
}
