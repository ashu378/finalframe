import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { CSSProperties, ReactElement } from 'react';
import { AUTHORED_COPY_POLICY } from './contract.js';

export interface BrandCardProps {
  copyPolicy?: typeof AUTHORED_COPY_POLICY;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  brandName?: string;
  logoUrl?: string;
  accentColor?: string;
  backgroundColor?: string;
  textColor?: string;
}

export interface FeatureCalloutProps extends BrandCardProps {
  feature: string;
  detail?: string;
  index?: string;
}

export interface EndCardProps extends BrandCardProps {
  callToAction?: string;
  url?: string;
}

const sans: CSSProperties = { fontFamily: 'Arial, Helvetica, sans-serif' };

function BrandMark({ logoUrl, brandName, accentColor }: Pick<BrandCardProps, 'logoUrl' | 'brandName' | 'accentColor'>) {
  return <div style={{ alignItems: 'center', display: 'flex', gap: 18, minHeight: 70 }}>
    {logoUrl ? <Img src={logoUrl} style={{ height: 68, maxWidth: 180, objectFit: 'contain' }} /> : <span style={{ background: accentColor, borderRadius: 18, height: 22, width: 22 }} />}
    {brandName ? <span style={{ ...sans, fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em' }}>{brandName}</span> : null}
  </div>;
}

export function BrandCard({ copyPolicy, eyebrow = copyPolicy === AUTHORED_COPY_POLICY ? '' : 'INTRODUCING', title, subtitle, brandName, logoUrl, accentColor = '#87a8ff', backgroundColor = '#111722', textColor = '#f5f7fb' }: BrandCardProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const reveal = spring({ frame, fps, config: { damping: 23, stiffness: 90, mass: 0.8 } });
  const shift = interpolate(reveal, [0, 1], [48, 0]);
  return <AbsoluteFill style={{ background: `radial-gradient(circle at 90% 8%, ${accentColor}55, transparent 42%), linear-gradient(135deg, ${backgroundColor}, #090d14)`, color: textColor, justifyContent: 'space-between', padding: 88 }}>
    <BrandMark logoUrl={logoUrl} brandName={brandName} accentColor={accentColor} />
    <div style={{ opacity: reveal, transform: `translateY(${shift}px)` }}>
      <div style={{ ...sans, color: accentColor, fontSize: 24, fontWeight: 700, letterSpacing: '.18em', marginBottom: 28 }}>{eyebrow}</div>
      <div style={{ ...sans, fontSize: 94, fontWeight: 800, letterSpacing: '-.06em', lineHeight: .98, maxWidth: 900 }}>{title}</div>
      {subtitle ? <div style={{ ...sans, color: '#c8d1e0', fontSize: 32, lineHeight: 1.3, marginTop: 28, maxWidth: 760 }}>{subtitle}</div> : null}
      <div style={{ background: accentColor, borderRadius: 8, height: 8, marginTop: 48, transform: `scaleX(${reveal})`, transformOrigin: 'left', width: 180 }} />
    </div>
    <div style={{ ...sans, color: '#738199', fontSize: 18, letterSpacing: '.12em' }}>{copyPolicy === AUTHORED_COPY_POLICY ? '' : 'MADE WITH FINALFRAME'}</div>
  </AbsoluteFill>;
}

export function FeatureCallout({ copyPolicy, eyebrow = copyPolicy === AUTHORED_COPY_POLICY ? '' : 'BUILT FOR YOU', title, subtitle, feature, detail, index = copyPolicy === AUTHORED_COPY_POLICY ? '' : '01', brandName, logoUrl, accentColor = '#87a8ff', backgroundColor = '#111722', textColor = '#f5f7fb' }: FeatureCalloutProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const reveal = spring({ frame, fps, config: { damping: 24, stiffness: 86 } });
  return <AbsoluteFill style={{ background: `linear-gradient(145deg, ${backgroundColor} 0%, #0a0e15 72%)`, color: textColor, justifyContent: 'space-between', padding: 88 }}>
    <BrandMark logoUrl={logoUrl} brandName={brandName} accentColor={accentColor} />
    <div style={{ alignItems: 'center', display: 'flex', gap: 50, opacity: reveal, transform: `translateY(${interpolate(reveal, [0, 1], [34, 0])}px)` }}>
      {copyPolicy !== AUTHORED_COPY_POLICY || index ? <div style={{ ...sans, color: accentColor, fontSize: 160, fontWeight: 800, letterSpacing: '-.08em', lineHeight: 1 }}>{index}</div> : null}
      <div>
        <div style={{ ...sans, color: accentColor, fontSize: 22, fontWeight: 700, letterSpacing: '.18em' }}>{eyebrow}</div>
        <div style={{ ...sans, fontSize: 74, fontWeight: 800, letterSpacing: '-.055em', lineHeight: 1, marginTop: 24, maxWidth: 760 }}>{feature || title}</div>
        {detail || subtitle ? <div style={{ ...sans, color: '#c8d1e0', fontSize: 30, lineHeight: 1.3, marginTop: 28, maxWidth: 720 }}>{detail || subtitle}</div> : null}
      </div>
    </div>
    <div style={{ background: '#ffffff18', borderRadius: 20, height: 7, overflow: 'hidden' }}><div style={{ background: accentColor, borderRadius: 20, height: '100%', transform: `scaleX(${reveal})`, transformOrigin: 'left', width: '100%' }} /></div>
  </AbsoluteFill>;
}

export function EndCard({ copyPolicy, eyebrow = copyPolicy === AUTHORED_COPY_POLICY ? '' : 'YOUR NEXT CHAPTER', title, subtitle, callToAction = copyPolicy === AUTHORED_COPY_POLICY ? '' : 'Get started', url, brandName, logoUrl, accentColor = '#87a8ff', backgroundColor = '#111722', textColor = '#f5f7fb' }: EndCardProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const reveal = spring({ frame, fps, config: { damping: 22, stiffness: 88 } });
  const ctaStyle: CSSProperties = { ...sans, background: accentColor, borderRadius: 18, color: '#0b1020', display: 'inline-flex', fontSize: 28, fontWeight: 800, marginTop: 34, padding: '22px 34px' };
  return <AbsoluteFill style={{ alignItems: 'center', background: `radial-gradient(ellipse at 50% 0%, ${accentColor}44, transparent 56%), ${backgroundColor}`, color: textColor, justifyContent: 'center', padding: 88, textAlign: 'center' }}>
    <div style={{ opacity: reveal, transform: `scale(${interpolate(reveal, [0, 1], [.94, 1])})` }}>
      <div style={{ display: 'flex', justifyContent: 'center' }}><BrandMark logoUrl={logoUrl} brandName={brandName} accentColor={accentColor} /></div>
      <div style={{ ...sans, color: accentColor, fontSize: 22, fontWeight: 700, letterSpacing: '.2em', marginTop: 72 }}>{eyebrow}</div>
      <div style={{ ...sans, fontSize: 92, fontWeight: 800, letterSpacing: '-.06em', lineHeight: 1, marginTop: 22, maxWidth: 940 }}>{title}</div>
      {subtitle ? <div style={{ ...sans, color: '#c8d1e0', fontSize: 30, margin: '26px auto 0', maxWidth: 720 }}>{subtitle}</div> : null}
      {copyPolicy !== AUTHORED_COPY_POLICY || callToAction ? <div style={ctaStyle}>{callToAction}</div> : null}
      {url ? <div style={{ ...sans, color: '#c8d1e0', fontSize: 24, marginTop: 20 }}>{url}</div> : null}
    </div>
  </AbsoluteFill>;
}

export function renderGraphicCard(templateId: string, props: Record<string, unknown>): ReactElement | null {
  if (templateId === 'brand-card') return <BrandCard {...props as unknown as BrandCardProps} />;
  if (templateId === 'feature-callout') return <FeatureCallout {...props as unknown as FeatureCalloutProps} />;
  if (templateId === 'end-card') return <EndCard {...props as unknown as EndCardProps} />;
  return null;
}
