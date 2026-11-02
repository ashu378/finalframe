import type { Id } from '../../../convex/_generated/dataModel';

export const PROJECT_LIBRARY_MODES = ['active', 'archived', 'deleted'] as const;
export type ProjectLibraryMode = (typeof PROJECT_LIBRARY_MODES)[number];
export type ProjectLibraryRow = {
  id: Id<'projects'>;
  externalId: string;
  name: string;
  description: string | null;
  status: string;
  createdAt: number;
  updatedAt: number;
  role: 'OWNER' | 'EDITOR' | 'REVIEWER' | 'VIEWER';
  moderationStatus: 'CLEAR' | 'RESTRICTED';
};
export type ProjectLibraryPage = {
  page: ProjectLibraryRow[];
  continueCursor: string | null;
  isDone: boolean;
  scanned: number;
};
export function parseProjectLibraryMode(value: string | undefined): ProjectLibraryMode {
  return value === 'archived' || value === 'deleted' ? value : 'active';
}
export function normalizeProjectSearch(value: string | undefined): string {
  const text = (value ?? '').trim().normalize('NFKC').toLowerCase();
  if (text.length > 100) throw new Error('Search must be 100 characters or fewer.');
  return text;
}
export function projectMatchesLibrary(project: { name: string; description?: string; status?: string; archivedAt?: number; deletedAt?: number }, mode: ProjectLibraryMode, search: string) {
  const deleted = project.status === 'DELETED' || project.deletedAt !== undefined;
  const archived = !deleted && (project.status === 'ARCHIVED' || project.archivedAt !== undefined);
  if (mode === 'deleted' ? !deleted : mode === 'archived' ? !archived : deleted || archived) return false;
  return !search || `${project.name}\n${project.description ?? ''}`.normalize('NFKC').toLowerCase().includes(search);
}
