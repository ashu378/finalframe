export const ACCOUNT_INDEX_VERSION = 1 as const;
export const ACCOUNT_INDEX_SCOPE = {
  title: 'Account and project index',
  included: [
    'Your user ID, display name, email and account timestamps.',
    'Your studio membership IDs, studio IDs, roles, states and timestamps.',
    'Your project membership IDs, roles, states and timestamps; project IDs only where you currently have access.',
    'Currently accessible OWNER or EDITOR project IDs, names, descriptions, types, lifecycle states, your role and timestamps.',
    'Restricted projects include only their ID, name, lifecycle state, restriction state and your role.',
  ],
  excluded: ['Media files and download URLs', 'Production contents, scripts, timelines and full project archives', 'Authentication/session records and secrets', 'Provider identifiers, voice identifiers and worker authority', 'Raw metadata, other people’s profiles and inaccessible project records'],
} as const;
export type AccountExportSummary = { requestId: string; status: 'OPEN' | 'COMPLETED' | 'CANCELED'; nextOrdinal: number; recordCount: number; expiresAt: number; expired: boolean };
export type AccountProfile = { userId: string; displayName: string; email: string; latestExport: AccountExportSummary | null };
export type DeactivationBlocker = { code: 'LAST_PLATFORM_ADMIN' | 'SHARED_STUDIO_OWNER' | 'SHARED_PROJECT_OWNER' | 'SCAN_LIMIT'; message: string };
export type DeactivationPreflight = { allowed: boolean; blockers: DeactivationBlocker[] };
export type AccountExportPart = { requestId: string; ordinal: number; filename: string; content: string; isDone: boolean; nextOrdinal: number; recordCount: number; replayed: boolean };
export type DeactivationRequestRow = { requestId: string; userId: string; displayName: string; email: string; reason: string; status: 'REQUESTED' | 'CANCELED'; createdAt: number };
