import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { requireAdmin } from '@/lib/guards';
import { getAdminOperations } from '@/lib/admin/actions';
import { OperationsTable } from '@/components/admin/operations-table';

export const metadata = { title: 'Payments | Admin', description: 'FinalFrame payment operations.' };

export default async function AdminPaymentsPage() {
  await requireAdmin();
  const data = await getAdminOperations();
  return <div className="space-y-8"><Link href="/admin" className="inline-flex items-center gap-2 text-sm text-[#cbb7a4] hover:text-[#f7f0e3]"><ArrowLeft className="size-4" /> Overview</Link><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-[#cbb7a4]">Finance</p><h1 className="ff-display mt-3 text-4xl font-semibold">Payment events</h1><p className="mt-3 max-w-2xl leading-7 text-[#cbb7a4]">Payment records are read-only until the Bachs sandbox integration is enabled.</p></div><OperationsTable data={data} kind="payments" /></div>;
}
