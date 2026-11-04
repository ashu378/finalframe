'use client';

import { useState } from 'react';
import { useMutation, usePaginatedQuery } from 'convex/react';
import Link from 'next/link';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';

const PAGE_SIZE = 20;
const roles = ['OWNER', 'EDITOR', 'REVIEWER', 'VIEWER'] as const;
type Role = (typeof roles)[number];

export function ProjectAccessSettings({ projectId }: { projectId: Id<'projects'> }) {
  const assigned = usePaginatedQuery(api.projects.listMembers, { projectId, scope: 'ASSIGNED' }, { initialNumItems: PAGE_SIZE });
  const available = usePaginatedQuery(api.projects.listMembers, { projectId, scope: 'AVAILABLE' }, { initialNumItems: PAGE_SIZE });
  const setMember = useMutation(api.projects.setMember);
  const removeMember = useMutation(api.projects.removeMember);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ failed: boolean; text: string }>();

  async function change(userId: Id<'users'>, role: Role | null) {
    setPending(true); setMessage(undefined);
    try {
      if (role) await setMember({ projectId, userId, role });
      else await removeMember({ projectId, userId });
      setMessage({ failed: false, text: role ? 'Project role saved.' : 'Project access revoked.' });
    } catch {
      setMessage({ failed: true, text: 'Access could not be changed. Check workspace membership and confirm that the project has an owner.' });
    } finally { setPending(false); }
  }

  return <div className="space-y-6">
    <p className="text-sm leading-6 text-muted-foreground">Owners manage access. Editors can change project content. Reviewers can make approval decisions. Viewers can open the project and its saved results.</p>
    {message && <p role={message.failed ? 'alert' : 'status'} className={message.failed ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>{message.text}</p>}
    {([['Assigned access', assigned], ['Add a workspace member', available]] as const).map(([title, roster]) => <section key={title} className="ff-card space-y-4 p-5" aria-label={title}>
      <h2 className="text-lg font-semibold">{title}</h2>
      {roster.status === 'LoadingFirstPage' && <p role="status" className="text-sm text-muted-foreground">Loading people…</p>}
      {roster.status === 'Exhausted' && !roster.results.length && <p className="text-sm text-muted-foreground">{title === 'Assigned access' ? 'There are no explicit role assignments to show.' : 'No additional active workspace members found.'}</p>}
      <ul className="space-y-3">{roster.results.map(person => <li key={`${person.userId}:${person.role}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3">
        <div className="min-w-0"><p className="break-words text-sm font-semibold">{person.name}{person.self ? ' (you)' : ''}</p><p className="text-xs text-muted-foreground">{person.role ? `${person.role.toLowerCase()} · ` : ''}Member ID ending in {person.userId.slice(-6)}</p></div>
        {!person.self && <div className="flex flex-wrap gap-2">
          {person.canAssign && <form className="flex flex-wrap gap-2" action={async data => {
            const role = data.get('role') as Role;
            if (roles.includes(role)) await change(person.userId, role);
          }}>
            <select name="role" aria-label={`Project role for ${person.name}`} defaultValue={person.role ?? 'VIEWER'} disabled={pending} className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm">
              {roles.map(role => <option key={role} value={role}>{role.charAt(0) + role.slice(1).toLowerCase()}</option>)}
            </select>
            <button type="submit" disabled={pending} className="ff-button-primary min-h-11">{person.role ? 'Save role' : 'Grant access'}</button>
          </form>}
          {person.role && <details className="rounded-xl border border-border px-3"><summary className="min-h-11 cursor-pointer py-3 text-sm">Revoke access</summary><button type="button" onClick={() => change(person.userId, null)} disabled={pending} className="ff-button-quiet min-h-11 text-destructive">Confirm revoke</button></details>}
        </div>}
      </li>)}</ul>
      {(roster.status === 'CanLoadMore' || roster.status === 'LoadingMore') && <button type="button" className="ff-button-quiet min-h-11" disabled={roster.status === 'LoadingMore'} onClick={() => roster.loadMore(PAGE_SIZE)}>Load more people</button>}
    </section>)}
    <Link href="/dashboard/settings/team" className="ff-link inline-flex min-h-11 items-center text-sm">Workspace team settings</Link>
  </div>;
}
