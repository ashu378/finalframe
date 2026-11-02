'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { changeLibraryProject } from '@/lib/project/library-actions';
import type { ProjectLibraryMode, ProjectLibraryRow } from '@/lib/project/library';

export function ProjectLibraryControls({ project, mode }: { project: ProjectLibraryRow; mode: ProjectLibraryMode }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState('');
  const [failed, setFailed] = useState(false);
  const canEdit = project.role === 'OWNER' || project.role === 'EDITOR';
  if (!canEdit || project.moderationStatus === 'RESTRICTED') return null;
  const nameId = `project-name-${project.id}`;
  function change(action: 'rename' | 'archive' | 'delete' | 'restore', name?: string) {
    start(async () => {
      setFeedback('');
      const result = await changeLibraryProject({ projectId: project.id, action, name });
      setFailed(!result.success);
      setFeedback(result.success ? 'Project updated.' : result.error || 'The project could not be changed.');
      if (result.success) router.refresh();
    });
  }
  return <div className="mt-5 space-y-4 border-t border-border/70 pt-4">
    <div className="flex flex-wrap items-start gap-4">{mode === 'active' ? <><details className="rounded-xl border border-border p-3"><summary className="min-h-8 cursor-pointer text-sm font-semibold">Rename</summary><form action={(formData) => change('rename', String(formData.get('name') || ''))} className="mt-3 flex flex-wrap gap-3"><label htmlFor={nameId} className="sr-only">Project name for {project.name}</label><input id={nameId} name="name" defaultValue={project.name} required maxLength={200} disabled={pending} className="min-h-11 max-w-full rounded-xl border border-border bg-background px-3 text-sm" /><button type="submit" disabled={pending} className="ff-button-primary min-h-11">Save name</button></form></details><button type="button" disabled={pending} onClick={() => change('archive')} className="ff-button-quiet min-h-11 border border-border">Archive project</button></> : <button type="button" disabled={pending} onClick={() => change('restore')} className="ff-button-primary min-h-11">Restore project</button>}
      {project.role === 'OWNER' && mode !== 'deleted' ? <details className="max-w-lg rounded-xl border border-border p-3"><summary className="min-h-8 cursor-pointer text-sm font-semibold text-destructive">Move to deleted</summary><p className="mt-2 text-sm leading-6 text-muted-foreground">This hides the project and blocks normal project access. Its media, approved versions, and history are retained, and you can restore it from Deleted.</p><button type="button" disabled={pending} onClick={() => change('delete')} className="ff-button-quiet mt-3 min-h-11 border border-destructive text-destructive">Confirm move to deleted</button></details> : null}
    </div>{feedback ? <p role={failed ? 'alert' : 'status'} className={`text-sm ${failed ? 'text-destructive' : 'text-muted-foreground'}`}>{feedback}</p> : null}
  </div>;
}
