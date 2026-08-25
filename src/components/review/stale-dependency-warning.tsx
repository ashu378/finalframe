import { AlertTriangle, ArrowRight, Link2Off } from 'lucide-react';
import type { ReviewDependencyWarning } from './review-types';

interface StaleDependencyWarningProps {
  warnings: ReviewDependencyWarning[];
  onResolve?: (warning: ReviewDependencyWarning) => void;
}

export function StaleDependencyWarning({ warnings, onResolve }: StaleDependencyWarningProps) {
  if (warnings.length === 0) return null;
  return <section className="rounded-2xl border border-[#d88f79]/45 bg-[#fff4ef] p-5" aria-labelledby="stale-dependencies-title"><div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/70 text-[#8d3f2c]"><Link2Off className="size-5" aria-hidden="true" /></span><div className="min-w-0"><p className="ff-eyebrow text-[#8d3f2c]">Needs attention before release</p><h2 id="stale-dependencies-title" className="mt-2 text-lg font-semibold text-[#7e3828]">This version has out-of-date inputs.</h2><p className="mt-2 text-sm leading-6 text-[#7e3828]/80">A source changed after this version was prepared. Review the affected parts before locking the timeline or exporting.</p><ul className="mt-4 space-y-2">{warnings.map((warning) => <li key={warning.id} className="flex flex-col gap-2 rounded-xl bg-white/55 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"><span><span className="flex items-center gap-2 font-semibold text-[#7e3828]"><AlertTriangle className="size-4" aria-hidden="true" />{warning.label}</span><span className="mt-1 block leading-6 text-[#7e3828]/75">{warning.detail}</span></span>{warning.href ? <a href={warning.href} className="ff-button-quiet min-h-10 shrink-0 justify-start px-3 text-[#7e3828] hover:bg-white/60">Review input <ArrowRight className="size-4" aria-hidden="true" /></a> : onResolve ? <button type="button" onClick={() => onResolve(warning)} className="ff-button-quiet min-h-10 shrink-0 justify-start px-3 text-[#7e3828] hover:bg-white/60">Resolve <ArrowRight className="size-4" aria-hidden="true" /></button> : null}</li>)}</ul></div></div></section>;
}
