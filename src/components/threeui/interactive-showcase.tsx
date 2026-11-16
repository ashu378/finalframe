'use client';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
const samples = [['comedy', 'A cartoon comedy'], ['cinema', 'A cinematic scene'], ['ugc', 'A product story']] as const;
function StaticScenes() {
  return <div className="grid min-h-[390px] grid-cols-3 items-center gap-2" aria-label="Original FinalFrame sample frames">{samples.map(([id,label]) => <div key={id} className="relative aspect-[3/4] overflow-hidden rounded-xl bg-card"><Image src={`/showcase/${id}.webp`} alt={label} fill sizes="(max-width:768px) 30vw,18vw" className="object-cover" /></div>)}</div>;
}
const Scene = dynamic(() => import('./interactive-scene').then(m => m.InteractiveShowcase), { ssr: false, loading: StaticScenes });
export function InteractiveShowcase() {
  const host = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  useEffect(() => {
    if (!('IntersectionObserver' in window)) return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    let inView = false;
    const update = () => setActive(inView && !media.matches);
    const observer = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; update(); }, { rootMargin: '200px' });
    if (host.current) observer.observe(host.current);
    media.addEventListener('change', update);
    return () => { observer.disconnect(); media.removeEventListener('change', update); };
  }, []);
  return <div ref={host} className="min-h-[390px]">{active ? <Scene /> : <StaticScenes />}</div>;
}
