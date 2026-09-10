import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { requireAdmin } from '@/lib/guards';
import { getAdminOperations } from '@/lib/admin/actions';
import { OperationsTable } from '@/components/admin/operations-table';

export const metadata = { title: 'Payments | Admin', description: 'FinalFrame payment operations.' };

export default async function AdminPaymentsPage() {
  await requireAdmin();
  const data = await getAdminOperations();
  return <div className="space-y-8"><Link href="/admin" className="inline-flex items-center gap-2 text-sm text-[#91a0b8] hover:text-[#eaf0fa]"><ArrowLeft className="size-4" /> Overview</Link><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-[#91a0b8]">Finance</p><h1 className="ff-display mt-3 text-4xl font-semibold">Payment reconciliation</h1><p className="mt-3 max-w-2xl leading-7 text-[#91a0b8]">Review confirmed purchases, pending provider events, and payments that need a clear next action.</p></div><OperationsTable data={data} kind="payments" /></div>;
}
