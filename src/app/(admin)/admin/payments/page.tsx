import Link from 'next/link';
import { requirePlatformRole } from '@/lib/guards/platform';

export default async function DeferredPaymentsPage() {
  await requirePlatformRole();
  return <div className="ff-card space-y-4 p-8"><h1 className="text-3xl font-semibold">Payments remain disabled.</h1><p className="text-sm leading-6 text-muted-foreground">Payment activation is a separate release checkpoint. This page does not start checkout, charge a customer, or grant credits.</p><Link href="/admin/credits" className="ff-link inline-flex min-h-11 items-center">Review credit ledger</Link></div>;
}
