'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Pause, Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

const scenes = [
  { id: 'cinema', name: 'Tell a bigger story', label: 'Films & series', note: 'One scene today. A whole world tomorrow.' },
  { id: 'comedy', name: 'Make someone laugh', label: 'Animation & comedy', note: 'A familiar face. An unexpected punchline.' },
  { id: 'ugc', name: 'Make it feel personal', label: 'Creator-style videos', note: 'A product, a person and a reason to watch.' },
];

export function CinematicHero() {
  const [selected, setSelected] = useState(0);
  const [playing, setPlaying] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const scene = scenes[selected];
  useEffect(() => {
    const pause = () => { if (document.hidden) { video.current?.pause(); setPlaying(false); } };
    document.addEventListener('visibilitychange', pause);
    return () => document.removeEventListener('visibilitychange', pause);
  }, []);
  return <section className="ff-cinema-hero" aria-label="Explore FinalFrame">
    <div className="ff-cinema-image" key={scene.id}>
      <Image src={`/showcase/${scene.id}-hero.webp`} alt={scene.name} fill priority sizes="100vw" className="object-cover" />
      {playing && <video ref={video} src={`/showcase/${scene.id}-hero.mp4`} poster={`/showcase/${scene.id}-hero.webp`} autoPlay loop muted playsInline onError={() => setPlaying(false)} className="absolute inset-0 h-full w-full object-cover" aria-label={`${scene.label} silent sample`} />}
    </div>
    <div className="ff-cinema-shade" />
    <div className="ff-container relative z-10 flex min-h-[660px] flex-col justify-end pb-7 pt-16 sm:min-h-[720px] sm:pb-9">
      <p className="mb-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.16em] text-white/80"><span className="size-2 rounded-full bg-primary" />Your ideas. In motion.</p>
      <h1 className="ff-display max-w-4xl text-[clamp(3.5rem,8.2vw,8rem)] font-semibold leading-[.94] tracking-[-.025em] text-white">Imagine it.<br /><span className="text-primary">Make it a film.</span></h1>
      <p className="mt-7 max-w-lg text-base leading-7 text-white/80 sm:text-lg">A funny short. A product launch. Your next episode. Turn a simple idea into scenes you can shape, edit and share.</p>
      <div className="mt-7 flex flex-wrap items-center gap-3"><Link href="/signup" className="ff-button-primary min-h-12 px-6">Start your story<ArrowRight className="size-4" /></Link><button type="button" onClick={() => setPlaying(value => !value)} className="ff-button min-h-12 border border-white/30 bg-black/30 text-white backdrop-blur-sm" aria-pressed={playing}>{playing ? <Pause className="size-4" /> : <Play className="size-4" />}{playing ? 'Pause sample' : 'Play sample'}</button></div>
      <div className="mt-12 grid grid-cols-3 gap-3 border-t border-white/25 pt-4 sm:mt-16 sm:gap-6" aria-label="Choose a sample">{scenes.map((item, index) => <button key={item.id} type="button" aria-pressed={selected === index} onClick={() => { setPlaying(false); setSelected(index); }} className={`ff-cinema-choice min-h-16 text-left ${selected === index ? 'is-selected' : ''}`}><span className="block text-xs text-white/60">0{index + 1}</span><span className="mt-1 block text-sm font-semibold sm:text-lg">{item.label}</span><span className="mt-1 hidden text-xs text-white/65 sm:block">{item.note}</span></button>)}</div>
      <p className="mt-4 text-xs text-white/60">Original FinalFrame development samples · Play to preview motion</p>
    </div>
  </section>;
}
