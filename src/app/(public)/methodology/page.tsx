import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';
const steps = [
  ['Tell us your idea', 'Describe what you want to make. Start with an idea, a script, a voice recording or video clips.'],
  ['Shape the story', 'Review the script, characters, scenes and pictures. Change the details before you approve the plan.'],
  ['Check the cost', 'See the estimate for each paid step. Nothing starts until you confirm it.'],
  ['Make your scenes', 'Choose the video versions you want to keep. Rework a scene without replacing the whole project.'],
  ['Edit, review and download', 'Bring the scenes together. Adjust sound, titles and captions, watch the result, then download it.'],
];
export default function MethodologyPage() {
  return <div><section className="ff-container py-16 sm:py-24"><h1 className="public-heading-hero max-w-4xl">From a rough idea<br />to your next video.</h1><p className="public-body-text mt-7 max-w-xl">You bring the story. FinalFrame helps with the steps in between, with room to make changes along the way.</p></section><section className="ff-container grid gap-12 pb-20 lg:grid-cols-[.7fr_1.3fr]"><div><p className="text-lg leading-8 text-muted-foreground">Start simple. Open more controls when you need them.</p><Link href="/signup" className="ff-button-primary mt-6">Start a project<ArrowRight className="size-4" /></Link></div><ol className="divide-y divide-border border-y border-border">{steps.map(([title,text],i)=><li key={title} className="flex gap-5 py-7 sm:gap-8"><span className="ff-display text-3xl text-primary">{i+1}</span><div><h2 className="ff-display text-2xl font-semibold">{title}</h2><p className="mt-3 max-w-xl leading-7 text-muted-foreground">{text}</p></div></li>)}</ol></section><section className="border-y border-border bg-card py-16"><div className="ff-container grid gap-8 md:grid-cols-2"><h2 className="ff-display text-3xl font-semibold">Come back for the next part.</h2><div><p className="leading-8 text-muted-foreground">Keep characters, voices, media and saved scenes in the same project. Continue a series or try another edit without losing the earlier work.</p><p className="mt-5 flex items-start gap-3 text-sm leading-7"><Check className="mt-1 size-4 shrink-0 text-primary" />Your other projects keep their own characters and settings.</p></div></div></section></div>;
}
