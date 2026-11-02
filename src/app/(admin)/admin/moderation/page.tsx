import { PlatformInventory } from '@/components/admin/platform-inventory';

export default async function AdminModerationPage({ searchParams }: { searchParams: Promise<{ cursor?: string; status?: string }> }) {
  const query = await searchParams;
  const reportStatus = query.status === 'RESOLVED' || query.status === 'DISMISSED' ? query.status : 'OPEN';
  return <PlatformInventory kind="reports" reportStatus={reportStatus} cursor={typeof query.cursor === 'string' ? query.cursor : undefined} />;
}
