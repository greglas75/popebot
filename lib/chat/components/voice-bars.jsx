'use client';

import { useRef, useEffect } from 'react';

const BAR_COUNT = 4;
const MULTIPLIERS = [0.7, 1.0, 0.85, 0.6];

export function VoiceBars({ volumeRef, isRecording }) {
  const barsRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    if (!isRecording) return;

    const animate = () => {
      const el = barsRef.current;
      if (!el) return;
      const raw = volumeRef.current;
      // Normalize: typical speech RMS ~0.02-0.15, clamp to 0-1
      const level = Math.min(raw * 8, 1);
      for (let i = 0; i < BAR_COUNT; i++) {
        const h = Math.max(3, level * 16 * MULTIPLIERS[i]);
        el.children[i].style.height = `${h}px`;
      }
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isRecording, volumeRef]);

  if (!isRecording) return null;

  return (
    <div ref={barsRef} className="flex items-center justify-center gap-[2px]" style={{ width: '16px', height: '16px' }}>
      {Array.from({ length: BAR_COUNT }, (_, i) => (
        <div
          key={i}
          className="w-[2px] rounded-full bg-current"
          style={{ height: '3px', transition: 'height 80ms ease-out' }}
        />
      ))}
    </div>
  );
}
