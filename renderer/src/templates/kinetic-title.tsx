import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { CSSProperties } from 'react';

export interface KineticTitleProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  accentColor?: string;
  backgroundColor?: string;
  textColor?: string;
}

const textStyle: CSSProperties = {
  fontFamily: 'Arial, Helvetica, sans-serif',
  letterSpacing: '-0.04em',
};

export function KineticTitle({
  eyebrow = 'FINALFRAME',
  title,
  subtitle,
  accentColor = '#ff6b4a',
  backgroundColor = '#111827',
  textColor = '#f9fafb',
}: KineticTitleProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const reveal = spring({ frame, fps, config: { damping: 200, stiffness: 100, mass: 0.8 } });
  const accentWidth = interpolate(frame, [0, 24], [0, 100], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const titleY = interpolate(reveal, [0, 1], [64, 0]);

  return (
    <AbsoluteFill style={{ backgroundColor, color: textColor, justifyContent: 'center', padding: 96 }}>
      <div style={{ ...textStyle, opacity: reveal, transform: `translateY(${titleY}px)` }}>
        <div style={{ color: accentColor, fontSize: 30, fontWeight: 700, letterSpacing: '0.16em' }}>{eyebrow}</div>
        <div style={{ backgroundColor: accentColor, height: 8, margin: '24px 0 36px', width: `${accentWidth}%` }} />
        <div style={{ fontSize: 112, fontWeight: 800, lineHeight: 0.95, maxWidth: 850 }}>{title}</div>
        {subtitle ? <div style={{ fontSize: 34, letterSpacing: '-0.01em', marginTop: 42, maxWidth: 700, opacity: 0.78 }}>{subtitle}</div> : null}
      </div>
    </AbsoluteFill>
  );
}
