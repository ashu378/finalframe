'use client';
import Image from 'next/image';
import { useState, useRef, useEffect } from 'react';
import { Play, X } from 'lucide-react';
import { showcaseItems } from '@/content/marketing';

export function ShowcaseGallery() {
  const [playing, setPlaying] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const lastPlayed = useRef<string | null>(null);
  useEffect(() => { if (!playing && lastPlayed.current) buttons.current.get(lastPlayed.current)?.focus(); }, [playing]);
  const play = (title: string) => { lastPlayed.current = title; setFailed(false); setPlaying(title); };
  return <div className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">{showcaseItems.map(item => <article key={item.title} className="min-w-0">
    <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-card">
      {playing === item.title && item.video ? <><video key={attempt} onError={() => setFailed(true)} className="h-full w-full object-contain" src={item.video} controls autoPlay playsInline aria-label={`${item.type} sample`} />{failed ? <div role="alert" className="absolute inset-x-3 top-16 rounded-xl bg-background p-4 text-sm"><p>This sample could not load.</p><button type="button" className="ff-button-secondary mt-3" onClick={() => { setFailed(false); setAttempt(x=>x+1); }}>Try again</button></div> : null}<button type="button" onClick={() => setPlaying(null)} aria-label={`Close ${item.type} sample`} className="absolute right-3 top-3 grid size-11 place-items-center rounded-full bg-background text-foreground"><X className="size-4" /></button></> : <><Image src={item.image} alt={item.title} fill sizes="(max-width:640px) 90vw,(max-width:1024px) 45vw,24vw" className="object-cover" />{item.video ? <button type="button" aria-label={`Play ${item.type} sample`} ref={node => { if (node) buttons.current.set(item.title,node); else buttons.current.delete(item.title); }} onClick={() => play(item.title)} className="absolute bottom-4 left-4 flex min-h-11 items-center gap-2 rounded-full bg-background px-4 text-sm font-semibold text-foreground"><Play className="size-4" />Play sample</button> : <span className="absolute bottom-4 left-4 rounded-full bg-background px-3 py-2 text-xs text-foreground">Sample frame</span>}</>}
    </div><p className="mt-4 text-sm text-primary">{item.type}</p><h3 className="ff-display mt-2 text-xl font-semibold">{item.title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{item.description}</p>
  </article>)}</div>;
}
