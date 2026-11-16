import { Wrench } from 'lucide-react';
export const metadata = { title: 'Maintenance', description: 'FinalFrame is temporarily unavailable while we make updates.' };
export default function MaintenancePage() {
  return <main id="main-content" className="flex min-h-dvh flex-col justify-center bg-background px-6 py-16 text-foreground"><div className="mx-auto w-full max-w-lg"><Wrench className="size-8 text-primary" aria-hidden="true" /><h1 className="ff-display mt-7 text-4xl font-semibold sm:text-5xl">We’re making a few updates.</h1><p className="mt-5 max-w-md leading-7 text-muted-foreground">FinalFrame is temporarily unavailable. Please check back shortly.</p><p className="mt-8 border-t border-border pt-5 text-sm text-muted-foreground">Thanks for your patience.</p></div></main>;
}
