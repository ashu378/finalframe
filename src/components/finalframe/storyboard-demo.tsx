'use client';

import Image from 'next/image';
import { ArrowRight, Check, Film, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { showcaseItems } from '@/content/marketing';

export function StoryboardDemo() {
  const [active, setActive] = useState(0);
  const item = showcaseItems[active];

  return (
    <div className="ff-card overflow-hidden p-3 sm:p-5">
      <div className="grid gap-4 lg:grid-cols-[1.12fr_.88fr]">
        <div className="relative min-h-[320px] overflow-hidden rounded-[1rem] bg-[#2c2520] sm:min-h-[430px]">
          <Image src={item.image} alt={item.title} fill className="object-cover transition duration-500" sizes="(max-width: 1024px) 100vw, 55vw" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#211b18]/90 via-transparent to-transparent" />
          <div className="absolute bottom-5 left-5 right-5 flex items-end justify-between gap-4 text-[#f7f0e3]">
            <div><p className="text-xs font-semibold uppercase tracking-[.14em] text-[#f6dfb1]">Preview · {item.type}</p><p className="mt-2 max-w-sm text-xl font-semibold">{item.title}</p></div>
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#f7f0e3] text-[#211b18]"><Film className="size-5" /></span>
          </div>
        </div>
        <div className="flex flex-col justify-between rounded-[1rem] bg-secondary/55 p-5 sm:p-7">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="size-4 text-accent" /> Your idea, made clearer</div>
            <p className="mt-5 text-lg leading-8 text-foreground">“Make a short {item.type.toLowerCase()} that feels warm, clear, and easy to share.”</p>
            <div className="mt-7 space-y-3">
              {['A simple story', 'A consistent visual style', 'A version ready to review'].map((text) => <div key={text} className="flex items-center gap-3 text-sm text-muted-foreground"><span className="grid size-6 place-items-center rounded-full bg-[hsl(var(--success)/.16)] text-[hsl(var(--success))]"><Check className="size-3.5" /></span>{text}</div>)}
            </div>
          </div>
          <div className="mt-8 flex items-center justify-between gap-3 border-t border-border/70 pt-5"><span className="text-sm font-medium text-muted-foreground">Try another example</span><button type="button" onClick={() => setActive((active + 1) % showcaseItems.length)} className="ff-button-secondary min-h-10 px-4 text-xs">Next <ArrowRight className="size-4" /></button></div>
        </div>
      </div>
    </div>
  );
}
