"use client";

import { useEffect, useState } from "react";
import { PET_FRAME_COUNT, PET_FPS, petFramePath } from "@/lib/pets";

// Plays the pre-generated PNG frame loop (4 fps). When animation is disabled or
// the page degraded for performance, the neutral first frame stays on screen.
export function PetSprite({
  species,
  stage,
  size = 64,
  animate = true,
  className,
}: {
  species: string;
  stage: number;
  size?: number;
  animate?: boolean;
  className?: string;
}) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!animate) return;
    const timer = window.setInterval(() => setTick(current => current + 1), 1000 / PET_FPS);
    return () => window.clearInterval(timer);
  }, [animate]);
  const frame = animate ? (tick % PET_FRAME_COUNT) + 1 : 1;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny pre-generated pixel sprites, not suited for next/image
    <img
      className={className}
      src={petFramePath(species, stage, frame)}
      width={size}
      height={size}
      alt=""
      draggable={false}
      style={{ imageRendering: "pixelated" }}
    />
  );
}
