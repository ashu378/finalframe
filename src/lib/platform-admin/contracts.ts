export const PLATFORM_ROLES = ['ADMIN', 'SUPPORT', 'MODERATOR'] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];
export const PLATFORM_INVENTORIES = ['users', 'jobs', 'reports', 'roles', 'credits', 'audit', 'routing'] as const;
export type PlatformInventoryKind = (typeof PLATFORM_INVENTORIES)[number];
export type PlatformInventoryRow = {
  id: string;
  title: string;
  subtitle: string;
  status: string;
  createdAt: number;
  details: Record<string, string | number | boolean | null>;
};
export type PlatformInventoryPage = { rows: PlatformInventoryRow[]; continueCursor: string | null; isDone: boolean };
export const PLATFORM_READ_ROLES: Record<PlatformInventoryKind, readonly PlatformRole[]> = {
  users: ['ADMIN', 'SUPPORT'], jobs: ['ADMIN', 'SUPPORT'], reports: ['ADMIN', 'MODERATOR'],
  roles: ['ADMIN'], credits: ['ADMIN', 'SUPPORT'], audit: ['ADMIN', 'SUPPORT', 'MODERATOR'], routing: ['ADMIN'],
};
export function parsePlatformInventory(value: string): PlatformInventoryKind | undefined {
  return (PLATFORM_INVENTORIES as readonly string[]).includes(value) ? value as PlatformInventoryKind : undefined;
}
