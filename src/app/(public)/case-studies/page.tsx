import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { ShowcaseGallery } from '@/components/finalframe/showcase-gallery';
export default function CaseStudiesPage() {
  return <div className="ff-container py-16 sm:py-24"><h1 className="public-heading-hero max-w-4xl">One studio.<br />Many kinds of story.</h1><p className="public-body-text mb-12 mt-7 max-w-xl">Explore short FinalFrame samples and starting points. Choose what fits your idea, then make it your own.</p><ShowcaseGallery /><p className="mt-10 max-w-2xl text-sm leading-7 text-muted-foreground">These are original development samples, not customer projects. Some show a single scene or an editing step rather than a complete production.</p><div className="mt-16 border-t border-border pt-12"><h2 className="ff-display text-3xl font-semibold">Have something different in mind?</h2><p className="mt-4 text-muted-foreground">Start with your own idea, script or media.</p><Link href="/signup" className="ff-button-primary mt-6">Start a project<ArrowRight className="size-4" /></Link></div></div>;
}
