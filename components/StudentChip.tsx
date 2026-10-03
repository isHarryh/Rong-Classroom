"use client";

import { useEffect, useRef, useState } from "react";

export type ChipEffect = { key: number; direction: 1 | -1; amount: number };

function useCountUp(target: number) {
  const [display, setDisplay] = useState(target);
  const [reduced] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const displayRef = useRef(target);
  useEffect(() => {
    const from = displayRef.current;
    if (from === target) return;
    if (reduced) {
      displayRef.current = target;
      return;
    }
    const duration = 550;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = Math.round(from + (target - from) * eased);
      displayRef.current = next;
      setDisplay(next);
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, reduced]);
  return reduced ? target : display;
}

export function StudentChip({
  name,
  balance,
  selected,
  effect,
  onClick,
}: {
  name: string;
  balance: number;
  selected: boolean;
  effect?: ChipEffect;
  onClick: () => void;
}) {
  const display = useCountUp(balance);
  return (
    <button type="button" className={`student-chip ${selected ? "selected" : ""}`} onClick={onClick}>
      {effect && (
        <span
          key={`delta-${effect.key}`}
          className={`chip-delta ${effect.direction > 0 ? "positive" : "negative"}`}
          aria-hidden
        >
          {effect.direction > 0 ? "+" : "-"}
          {effect.amount}
        </span>
      )}
      <span
        key={effect ? `content-${effect.key}` : "content"}
        className={`chip-content ${effect ? (effect.direction > 0 ? "chip-bump" : "chip-shake") : ""}`}
      >
        <span>{name}</span>
        <span className="coin">{display} 榕币</span>
      </span>
      {effect && (
        <span
          key={`glow-${effect.key}`}
          className={`chip-glow ${effect.direction > 0 ? "positive" : "negative"}`}
          aria-hidden
        />
      )}
    </button>
  );
}
