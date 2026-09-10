'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

const PredictiveArcCanvas = dynamic(
  () => import('@designcodeio/threeui/components/PredictiveArcCanvas').then((module) => module.PredictiveArcCanvas),
  { ssr: false },
);
const StructureFlowCollection = dynamic(
  () => import('@designcodeio/threeui/components/StructureFlowCollection').then((module) => module.StructureFlowCollection),
  { ssr: false },
);
const DiagnosticsPanel = dynamic(
  () => import('@designcodeio/threeui/components/DiagnosticsPanel').then((module) => module.DiagnosticsPanel),
  { ssr: false },
);
const PerformanceGauges = dynamic(
  () => import('@designcodeio/threeui/components/PerformanceGauges').then((module) => module.PerformanceGauges),
  { ssr: false },
);

type AmbientVariant = 'hero' | 'flow' | 'diagnostics' | 'gauges';

type ThreeUIAmbientProps = {
  variant: AmbientVariant;
  className?: string;
  label?: string;
};

function StaticFallback({ label }: { label: string }) {
  return (
    <div className="ff-ambient-fallback" aria-hidden="true">
      <span className="ff-ambient-fallback__grid" />
      <span className="ff-ambient-fallback__orb" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function ThreeUIAmbient({ variant, className = '', label = 'FinalFrame visual workspace' }: ThreeUIAmbientProps) {
  const [webglAvailable, setWebglAvailable] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const probe = document.createElement('canvas');
    const context = probe.getContext('webgl2') ?? probe.getContext('webgl') ?? probe.getContext('experimental-webgl');
    setWebglAvailable(Boolean(context));
    probe.width = 1;
    probe.height = 1;
  }, []);

  return (
    <div className={`ff-ambient ${className}`} data-ambient-variant={variant} data-webgl={webglAvailable ? 'enabled' : 'fallback'} role="presentation">
      <div className="ff-ambient__fallback">
        <StaticFallback label={label} />
      </div>
      <div className="ff-ambient__canvas" aria-hidden="true">
        {webglAvailable && variant === 'hero' ? <PredictiveArcCanvas variant="predictive" /> : null}
        {webglAvailable && variant === 'flow' ? <StructureFlowCollection variant="structure-flow" /> : null}
        {webglAvailable && variant === 'diagnostics' ? <DiagnosticsPanel variant="flow" mode="dark" /> : null}
        {webglAvailable && variant === 'gauges' ? <PerformanceGauges variant="tachometer" mode="dark" /> : null}
      </div>
    </div>
  );
}
