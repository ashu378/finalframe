import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { requireAdmin } from '@/lib/guards';
import { getAdminOperations } from '@/lib/admin/actions';
import { OperationsTable } from '@/components/admin/operations-table';

export const metadata = { title: 'Audit | Admin', description: 'FinalFrame audit trail.' };

export default async function AdminAuditPage() {
  await requireAdmin();
  const data = await getAdminOperations();
  return <div className="space-y-8"><Link href="/admin" className="inline-flex items-center gap-2 text-sm text-[#cbb7a4] hover:text-[#f7f0e3]"><ArrowLeft className="size-4" /> Overview</Link><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-[#cbb7a4]">Governance</p><h1 className="ff-display mt-3 text-4xl font-semibold">Audit trail</h1><p className="mt-3 max-w-2xl leading-7 text-[#cbb7a4]">A truthful record of operational changes and system events.</p></div><OperationsTable data={data} kind="audit" /></div>;
}
