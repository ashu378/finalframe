import type { Id } from '../../../convex/_generated/dataModel';
export type WorkspaceRole = 'owner' | 'admin' | 'member';
export type TeamContext = { studioId: Id<'studios'>; studioExternalId: string; name: string; role: WorkspaceRole; recordedOwner: boolean; userId: Id<'users'> };
export type TeamMemberRow = { key: string; userId: Id<'users'> | null; displayName: string; role: WorkspaceRole; status: string; source: 'canonical' | 'legacy'; recordedOwner: boolean };
export type TeamInvitationRow = { invitationId: Id<'studioInvitations'>; recipientUserId: Id<'users'>; role: 'admin' | 'member'; status: 'PENDING' | 'ACCEPTED' | 'REVOKED'; expiresAt: number; expired: boolean; createdAt: number };
export type TeamPage<T> = { rows: T[]; isDone: boolean; continueCursor: string | null };
export type WorkspaceRow = { studioId: Id<'studios'>; name: string; role: WorkspaceRole; selected: boolean };
export type InvitationPreview = { invitationId: Id<'studioInvitations'>; studioId: Id<'studios'>; studioName: string; role: 'admin' | 'member'; expiresAt: number; status: 'PENDING' | 'ACCEPTED'; canAccept: boolean };
