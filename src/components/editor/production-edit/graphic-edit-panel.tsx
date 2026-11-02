'use client';
import { useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import { parseGraphicsV2Authoring, type GraphicsV2Props, type GraphicsV2TemplateId } from '../../../../renderer/src/templates/graphics-v2-contract';
import { GraphicDesigner, type GraphicDraft } from '@/components/production-workspace/graphic-designer';
import { Button } from '@/components/ui/button';
import { controlInput } from '@/components/production-workspace/resource-approval-controls';
type Clip = {
    id: string;
    kind: string;
    durationSeconds: number;
    assetId?: string;
    metadata: Record<string, unknown>;
};
function initial(clip: Clip): GraphicDraft {
    const raw = clip.metadata.templateProps as Record<string, unknown> ?? {};
    const keys = ['title', 'subtitle', 'eyebrow', 'brandName', 'accentColor', 'backgroundColor', 'textColor', 'feature', 'detail', 'index', 'callToAction', 'url', 'screenFit', 'focus', 'cursor', 'series', 'unit', 'sourceNote', 'steps', 'activeStep'];
    const props = { ...Object.fromEntries(keys.filter(key => Object.prototype.hasOwnProperty.call(raw, key)).map(key => [key, raw[key]])), layoutVersion: 2, title: typeof raw.title === 'string' ? raw.title : '' } as GraphicsV2Props;
    const templateId = String(clip.metadata.motionTemplateId ?? 'kinetic-title') as GraphicsV2TemplateId;
    if (templateId === 'end-card' && props.callToAction === undefined)
        props.callToAction = 'Get started';
    return { templateId, props, ...(clip.assetId ? templateId === 'product-ui' ? { screenAssetId: clip.assetId } : { logoAssetId: clip.assetId } : {}) };
}
export function GraphicEditPanel({ projectId, clips, fps, disabled, onApply }: {
    projectId: Id<'projects'>;
    clips: Clip[];
    fps: number;
    disabled: boolean;
    onApply: (input: {
        clipId: string;
        graphic: GraphicDraft;
    }) => Promise<void>;
}) {
    const choices = clips.filter(clip => clip.kind === 'GRAPHIC'), images = useQuery(api.timeline.graphicsImages, { projectId });
    const [selected, setSelected] = useState(choices[0]?.id ?? ''), [value, setValue] = useState<GraphicDraft | undefined>(() => choices[0] ? initial(choices[0]) : undefined), [error, setError] = useState('');
    if (!choices.length || !images?.enabled || !images.canEdit || !value)
        return null;
    const clip = choices.find(clip => clip.id === selected)!;
    return <section className="ff-card space-y-4 p-5 sm:p-7" aria-label="Revise exact graphic"><h3 className="text-xl font-semibold">Revise graphic content</h3><p className="text-sm text-muted-foreground">Save complete text, data and approved images into a new timeline version. Existing approved exports stay attached to their original content.</p><label className="grid gap-1 text-sm">Graphic clip<select value={selected} className={controlInput} disabled={disabled} onChange={e => { const next = choices.find(clip => clip.id === e.target.value)!; setSelected(next.id); setValue(initial(next)); setError(''); }}>{choices.map((clip, index) => <option key={clip.id} value={clip.id}>Graphic {index + 1} · {String((clip.metadata.templateProps as Record<string, unknown>)?.title ?? 'Untitled')}</option>)}</select></label><GraphicDesigner value={value} onChange={setValue} images={images.images} disabled={disabled}/>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<Button disabled={disabled} onClick={async () => { try {
        const spec = parseGraphicsV2Authoring(value, Math.round(clip.durationSeconds * fps), fps);
        setError('');
        await onApply({ clipId: selected, graphic: { ...value, props: spec.props } });
    }
    catch (error) {
        setError(error instanceof Error ? error.message : 'Check exact graphic content.');
    } }}>Save as a new timeline version</Button></section>;
}
