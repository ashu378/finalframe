'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import type { Id } from '../../../../convex/_generated/dataModel';
import { api } from '../../../../convex/_generated/api';
import { CheckCircle2, CircleAlert, Film } from 'lucide-react';
import type { ProductionGraphNode } from '@/lib/production-graph/contracts';
import { toTimelineVersion } from '@/lib/production/timeline-view';
import { PromptEditPanel, type PromptEditSubmission } from './prompt-edit-panel';
import type { ProductionEditImpact } from './edit-impact-summary';
import { TimelineEditor, type TimelineEditEvent } from '@/components/editor/timeline-editor/timeline-editor';

type ProductionId = Id<'productions'>;

const targetTypeMap: Record<string, string> = {
  productions: 'production', productionVersions: 'productionVersion', directorPlans: 'productionVersion',
  sequences: 'sequence', scenes: 'scene', shots: 'shot', shotVersions: 'shotVersion',
  assets: 'asset', audio: 'audio', transcripts: 'transcript', captions: 'captionTrack',
  timelines: 'timeline', reviews: 'review', exports: 'export',
};

function asProductionId(value: string) {
  return value as ProductionId;
}

function makeImpact(value: any): ProductionEditImpact {
  const item = (entry: any) => ({ id: String(entry.resourceId), label: String(entry.resourceType).replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase()), kind: entry.resourceType, detail: entry.state === 'OUTDATED' ? 'Already marked for an update' : undefined });
  return { direct: Array.isArray(value?.direct) ? value.direct.map(item) : [], affected: Array.isArray(value?.downstream) ? value.downstream.map(item) : [], summary: value?.affected?.length ? `${value.affected.length} connected production step${value.affected.length === 1 ? '' : 's'} may be affected.` : 'Only the selected step is expected to change.' };
}

export function EditSurface({ productionId, nodes }: { productionId: string; nodes: ProductionGraphNode[] }) {
  const convexProductionId = asProductionId(productionId);
  const [selectedNode, setSelectedNode] = useState<ProductionGraphNode | null>(nodes.find((node) => ['videoTake', 'shot', 'image'].includes(node.kind)) ?? nodes[0] ?? null);
  const [impactRequested, setImpactRequested] = useState(false);
  const [activeTimelineId, setActiveTimelineId] = useState<Id<'timelines'> | undefined>();
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved' | 'error'>('saved');
  const [message, setMessage] = useState<string | null>(null);
  const [impactError, setImpactError] = useState<string | null>(null);
  const impactQuery = useQuery(api.productionOperations.previewImpact, selectedNode ? { productionId: convexProductionId, targetType: targetTypeMap[selectedNode.resourceType] ?? 'production', targetId: selectedNode.resourceId } : 'skip');
  const draft = useQuery(api.timelineEditor.getDraft, { productionId: convexProductionId, timelineId: activeTimelineId });
  const previewOperation = useMutation(api.productionOperations.create);
  const applyTimelineEdit = useMutation(api.timelineEditor.apply);
  const undoTimelineEdit = useMutation(api.timelineEditor.undo);
  const redoTimelineEdit = useMutation(api.timelineEditor.redo);
  const canonicalTimelineState = useQuery(api.approvals.get, draft?.timeline?.projectId ? { projectId: draft.timeline.projectId as Id<'projects'>, productionId: convexProductionId, resourceType: 'timeline', resourceId: String(draft.timeline._id) } : 'skip');
  const timeline = useMemo(() => toTimelineVersion(draft, canonicalTimelineState?.currentState), [draft, canonicalTimelineState?.currentState]);
  const canEditTimeline = canonicalTimelineState !== undefined && ['DRAFT', 'REVISION_REQUESTED'].includes(canonicalTimelineState.currentState);
  const history = draft?.operations?.filter((operation: any) => operation.outputResourceIds.includes(String(draft.timeline._id))) ?? [];
  const canUndo = canEditTimeline && history.some((operation: any) => operation.kind !== 'CREATE_TIMELINE');
  const canRedo = canEditTimeline && history.some((operation: any) => operation.kind === 'UNDO');

  const impact = impactRequested && impactQuery ? makeImpact(impactQuery) : null;

  function selectNode(node: ProductionGraphNode) {
    setSelectedNode(node);
    setImpactRequested(false);
    setImpactError(null);
    setMessage(null);
  }

  async function handlePromptPreview() {
    setImpactRequested(true);
    setImpactError(null);
  }

  async function handlePromptSubmit(submission: PromptEditSubmission) {
    try {
      setMessage(null);
      await previewOperation({ productionId: convexProductionId, kind: 'EDIT_PROMPT', targetType: targetTypeMap[submission.node.resourceType] ?? 'production', targetId: submission.node.resourceId, input: { instruction: submission.instruction, impact: submission.impact }, idempotencyKey: `prompt-edit:${crypto.randomUUID()}` });
      setMessage('Your change is saved. FinalFrame will ask for approval before making a new take.');
    } catch (error) {
      setImpactError('We could not save this change. Check project permissions and whether the timeline is locked.');
    }
  }

  async function handleTimelineEdit(event: TimelineEditEvent) {
    if (event.type === 'select-clip' || !timeline) return;
    const timelineId = asProductionId(timeline.id) as unknown as Id<'timelines'>;
    const idempotencyKey = `timeline-edit:${crypto.randomUUID()}`;
    try {
      setSaveStatus('saving');
      setMessage(null);
      if (event.type === 'undo') {
        const result = await undoTimelineEdit({ timelineId, idempotencyKey });
        setActiveTimelineId(result.timelineId as Id<'timelines'>);
      } else if (event.type === 'redo') {
        const result = await redoTimelineEdit({ timelineId, idempotencyKey });
        setActiveTimelineId(result.timelineId as Id<'timelines'>);
      } else if (event.type === 'replace') {
        setMessage('Choose replacement media from the Media workspace before replacing this take.');
        setSaveStatus('saved');
        return;
      } else {
        const selectedClip = timeline.tracks.flatMap((track) => track.clips).find((clip) => clip.id === event.clipId);
        let kind: 'trim' | 'split' | 'reorder' | 'replace' | 'updateText' | 'updateCaptions' | 'adjustAudio' | 'addTransition' = 'trim';
        let input: Record<string, unknown> = { clipId: event.clipId };
        if (event.type === 'trim') { kind = 'trim'; input = { clipId: event.clipId, trimStartSeconds: event.startSeconds, trimEndSeconds: event.endSeconds }; }
        if (event.type === 'split') { kind = 'split'; input = { clipId: event.clipId, splitAtSeconds: Math.max(0.1, (selectedClip?.durationSeconds ?? 1) / 2) }; }
        if (event.type === 'move') { kind = 'reorder'; input = { clipId: event.clipId, toIndex: event.direction === 'earlier' ? 0 : 999 }; }
        if (event.type === 'transition') { kind = 'addTransition'; input = { clipId: event.clipId, position: 'out', transitionKind: event.transition, durationSeconds: event.durationSeconds, audioPolicy: event.audioPolicy, trimSoundtrackToPicture: event.trimSoundtrackToPicture }; }
        if (event.type === 'captions') { kind = 'updateCaptions'; input = { clipId: event.clipId, cues: event.cues, language: event.language, style: event.style }; }
        if (event.type === 'audio-level') { kind = 'adjustAudio'; input = { clipId: event.clipId, volume: Math.pow(10, event.volumeDb / 20) }; }
        const result = await applyTimelineEdit({ timelineId, kind, input, idempotencyKey });
        setActiveTimelineId(result.timelineId as Id<'timelines'>);
      }
      setSaveStatus('saved');
      setMessage('A new editable version is ready. Your previous version is still preserved.');
    } catch (error) {
      setSaveStatus('error');
      const detail = error instanceof Error ? error.message.match(/Uncaught Error: ([^\n]+)/)?.[1] : undefined;
      setMessage(detail && /caption|transition|soundtrack|picture|dialogue|voiceover|frame|gap|overlap/i.test(detail) ? detail.slice(0, 300) : 'This edit could not be saved. Review timing, captions, project permissions and version locks.');
    }
  }

  if (!selectedNode || nodes.length === 0) return <section className="ff-card p-8 text-center"><Film className="mx-auto size-8 text-muted-foreground" /><h2 className="ff-display mt-4 text-2xl font-semibold">Select a production step to edit.</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Your prompt edits will stay attached to the exact part of the production they change.</p></section>;

  return <div className="space-y-8">
    <section className="ff-card p-5 sm:p-7"><div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="ff-eyebrow">Editing workspace</p><h2 className="ff-display mt-2 text-3xl font-semibold">Change one part without losing the rest.</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Use a plain-language request for a creative change, or select a clip below for practical timing and audio edits.</p></div><label className="grid gap-2 text-sm font-semibold sm:min-w-64">Editing <select value={selectedNode.id} onChange={(event) => { const node = nodes.find((candidate) => candidate.id === event.target.value); if (node) selectNode(node); }} className="h-11 rounded-xl border border-input bg-background px-3 font-normal outline-none focus:border-primary focus:ring-2 focus:ring-ring/40">{nodes.map((node) => <option key={node.id} value={node.id}>{node.label}</option>)}</select></label></div></section>
    <PromptEditPanel selectedNode={selectedNode} impact={impact} impactLoading={impactRequested && impactQuery === undefined} impactError={impactError} onPreviewImpact={handlePromptPreview} onSubmitOperation={handlePromptSubmit} />
    <TimelineEditor timeline={timeline} frameRate={timeline?.frameRate} finishingV5Enabled={draft?.finishingV5Enabled === true} isLoading={draft === undefined || Boolean(draft?.timeline && canonicalTimelineState === undefined)} readOnly={!canEditTimeline} saveStatus={saveStatus} canUndo={canUndo} canRedo={canRedo} onEdit={handleTimelineEdit} />
    {message ? <div className="flex items-start gap-3 rounded-2xl border border-border/70 bg-secondary/45 p-4 text-sm" role="status"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[hsl(var(--success))]" aria-hidden="true" /><span>{message}</span></div> : null}
    {impactError ? <div className="flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive" role="alert"><CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><span>{impactError}</span></div> : null}
  </div>;
}
