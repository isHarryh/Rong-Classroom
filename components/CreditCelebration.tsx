"use client";

import { useEffect, useRef } from "react";

export type CreditCelebrationEvent = {
  key: number;
  direction: 1 | -1;
  amount: number;
  count: number;
  label?: string;
  origin?: { x: number; y: number };
};

export function CreditCelebration({ event }: { event?: CreditCelebrationEvent }) {
  const fired = useRef(-1);
  useEffect(() => {
    if (!event || event.direction < 0 || fired.current === event.key) return;
    fired.current = event.key;
    const timers: number[] = [];
    const origin = event.origin ?? { x: 0.5, y: 0.42 };
    const base = {
      origin,
      zIndex: 1000,
      disableForReducedMotion: true,
      colors: ["#176b5d", "#2f9e83", "#71c9a8", "#d9a24a", "#f6d28f", "#ffffff"],
      scalar: 1.1,
    };
    void import("canvas-confetti").then(({ default: confetti }) => {
      if (event.count >= 5) {
        confetti({ ...base, particleCount: 90, spread: 100, startVelocity: 45, angle: 60 });
        timers.push(
          window.setTimeout(
            () => confetti({ ...base, particleCount: 90, spread: 100, startVelocity: 45, angle: 120 }),
            140,
          ),
        );
      } else {
        confetti({ ...base, particleCount: event.amount >= 5 ? 110 : 70, spread: 70, startVelocity: 38 });
      }
    });
    return () => timers.forEach(timer => window.clearTimeout(timer));
  }, [event]);

  if (!event) return null;
  const positive = event.direction > 0;
  return (
    <div className="score-pop-layer">
      <div key={event.key} className={`score-pop ${positive ? "positive" : "negative"}`} role="status">
        <span className="score-pop-value">
          {positive ? "+" : "-"}
          {event.amount} 分
        </span>
        <span className="score-pop-sub">
          {event.label ? `${event.label} · ` : ""}
          {event.count} 名学生
        </span>
      </div>
    </div>
  );
}
