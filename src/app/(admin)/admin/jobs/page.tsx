import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { requireAdmin } from '@/lib/guards';
import { getAdminOperations } from '@/lib/admin/actions';
import { OperationsTable } from '@/components/admin/operations-table';

export const metadata = { title: 'Jobs | Admin', description: 'FinalFrame generation operations.' };

export default async function AdminJobsPage() {
  await requireAdmin();
  const data = await getAdminOperations();
  return <div className="space-y-8"><Link href="/admin" className="inline-flex items-center gap-2 text-sm text-[#cbb7a4] hover:text-[#f7f0e3]"><ArrowLeft className="size-4" /> Overview</Link><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-[#cbb7a4]">Operations</p><h1 className="ff-display mt-3 text-4xl font-semibold">Generation jobs</h1><p className="mt-3 max-w-2xl leading-7 text-[#cbb7a4]">See what is queued, processing, complete, or needs attention.</p></div><OperationsTable data={data} kind="jobs" /></div>;
}
