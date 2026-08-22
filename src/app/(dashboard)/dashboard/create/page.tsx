import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { requireAuth } from '@/lib/guards';
import { CreateProductionForm } from '@/components/production/create-production-form';
import { getStudioContext } from '@/lib/project/actions';

export const metadata = { title: 'Create | FinalFrame', description: 'Create a video from an idea, script, voice, images, or footage.' };

export default async function CreatePage() {
    await requireAuth();
    const studio = await getStudioContext();
    return <div className="mx-auto max-w-5xl space-y-10 py-5 sm:py-8"><div><Link href="/dashboard" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition hover:text-foreground"><ArrowLeft className="size-4" /> Back to projects</Link><p className="ff-eyebrow mt-10">Create a video</p><h1 className="public-heading-section mt-4">What do you want to make?</h1><p className="public-body-text mt-5 max-w-2xl">Describe it, paste it, upload it, or bring your own media. We will prepare the plan and show the credit cost before anything expensive starts.</p></div><CreateProductionForm studioId={studio.studioId} /></div>;
}
