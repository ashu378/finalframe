'use client';

import Image from 'next/image';
import { MousePointer2, Smartphone, Sparkles } from 'lucide-react';
import { CSSProperties, PointerEvent, useCallback, useState } from 'react';

type Tilt = { x: number; y: number };

const frames = [
  { src: '/images/generated/finalframe-3d-blueprint.webp', label: '01 · Build the blueprint', className: 'ff-reel-card--left' },
  { src: '/images/generated/finalframe-3d-studio.webp', label: '02 · Shape the scene', className: 'ff-reel-card--center' },
  { src: '/images/generated/finalframe-3d-review.webp', label: '03 · Review the final frame', className: 'ff-reel-card--right' },
];

export function InteractiveShowcase() {
  const [tilt, setTilt] = useState<Tilt>({ x: 0, y: 0 });
  const [isInteracting, setIsInteracting] = useState(false);

  const updateTilt = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = Math.max(-1, Math.min(1, ((event.clientX - bounds.left) / bounds.width - 0.5) * 2));
    const y = Math.max(-1, Math.min(1, ((event.clientY - bounds.top) / bounds.height - 0.5) * 2));
    setTilt({ x, y });
    setIsInteracting(true);
  }, []);

  const resetTilt = useCallback(() => {
    setTilt({ x: 0, y: 0 });
    setIsInteracting(false);
  }, []);

  const style = {
    '--reel-x': tilt.x,
    '--reel-y': tilt.y,
  } as CSSProperties;

  return (
    <div
      className={`ff-interactive-reel ${isInteracting ? 'is-interacting' : ''}`}
      style={style}
      onPointerMove={updateTilt}
      onPointerLeave={resetTilt}
      onPointerUp={resetTilt}
      onPointerCancel={resetTilt}
      role="img"
      aria-label="Interactive 3D storyboard preview. Move your pointer or finger across the frames."
    >
      <div className="ff-reel-glow" aria-hidden="true" />
      <div className="ff-reel-stage">
        {frames.map((frame) => (
          <div key={frame.src} className={`ff-reel-card ${frame.className}`}>
            <div className="ff-reel-card__image">
              <Image src={frame.src} alt={frame.label} fill sizes="(max-width: 768px) 70vw, 28vw" />
              <div className="ff-reel-card__shine" aria-hidden="true" />
            </div>
            <div className="ff-reel-card__meta">
              <span>{frame.label}</span>
              <span className="ff-reel-card__dot" />
            </div>
          </div>
        ))}
        <div className="ff-reel-status">
          <span className="grid size-8 place-items-center rounded-lg bg-accent/15 text-accent"><Sparkles className="size-4" /></span>
          <span><strong>Plan in motion</strong><small>Drag across the story</small></span>
        </div>
      </div>
      <div className="ff-reel-hint">
        <MousePointer2 className="size-4" />
        <span className="hidden sm:inline">Move to explore</span>
        <span className="sm:hidden"><Smartphone className="mr-1 inline size-3.5" />Touch to explore</span>
      </div>
    </div>
  );
}
