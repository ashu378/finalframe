import { PlatformInventory } from '@/components/admin/platform-inventory';

export default async function AdminInventoryPage({ searchParams }: { searchParams: Promise<{ cursor?: string }> }) {
  const query = await searchParams;
  return <PlatformInventory kind="audit" cursor={typeof query.cursor === 'string' ? query.cursor : undefined} />;
}
