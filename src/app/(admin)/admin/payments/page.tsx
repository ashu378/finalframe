import Link from 'next/link';
import { requirePlatformRole } from '@/lib/guards/platform';

export default async function DeferredPaymentsPage() {
  await requirePlatformRole();
  return <div className="ff-card space-y-4 p-8"><h1 className="text-3xl font-semibold">Payments are off.</h1><p className="text-sm leading-6 text-muted-foreground">Payments will be connected in a later step. No checkout, customer charge or credit purchase is enabled here.</p><Link href="/admin/credits" className="ff-link inline-flex min-h-11 items-center">View credit history</Link></div>;
}
