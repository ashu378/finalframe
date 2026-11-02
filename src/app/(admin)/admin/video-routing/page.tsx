import { refreshVideoModelCatalog, reviewVideoModelCapabilities, saveVideoRoutePolicy } from '@/lib/admin/actions';
import { requireAdmin } from '@/lib/guards';
import { api } from '@/../convex/_generated/api';
import { getAuthenticatedConvexClient } from '@/lib/convex/server';
import { VIDEO_TYPE_LABELS, VIDEO_TYPES, VIDEO_OPERATIONS } from '@/lib/ai/video-routing';
import type { VideoType } from '@/lib/ai/video-routing';

export const metadata = { title: 'Video model routing | Admin', description: 'Manage verified video model capabilities and routes.' };

const capabilityFields = [
  ['supportsTextToVideo', 'Text to video'],
  ['supportsImageReferences', 'Image references'],
  ['supportsFirstFrame', 'First frame'],
  ['supportsLastFrame', 'Last frame'],
  ['supportsAudio', 'Generated audio output'],
  ['supportsVideoReferences', 'Source video references'],
  ['supportsVideoEdit', 'Source video editing'],
  ['supportsVideoExtension', 'Completed-job continuation'],
  ['supportsAudioReferences', 'Supplied audio references'],
  ['supportsPerformanceTransfer', 'Performance transfer'],
  ['supportsLipSync', 'Supplied-audio lip sync'],
  ['supportsUpscale', 'Video upscaling'],
  ['supportsSourceAudioPreservation', 'Source audio preservation'],
  ['supportsCombinedFrameReferences', 'Combined frames and references'],
] as const;

export default async function AdminVideoRoutingPage() {
  await requireAdmin();
  const client = await getAuthenticatedConvexClient();
  const current = await client.query(api.account.current, {});
  const studioExternalId = current.studio?.externalId;
  if (!studioExternalId) throw new Error('No studio is associated with the admin account.');
  const config = await client.query(api.videoRouting.listForAdmin, { studioExternalId });
  const catalog = [...config.catalog].sort((a, b) => String(a.modelId).localeCompare(String(b.modelId)));

  return <div className="space-y-8">
    <header className="rounded-2xl border border-[#263143] bg-[#101722] p-7 sm:p-9">
      <p className="text-xs font-semibold uppercase tracking-[.16em] text-[#91a0b8]">Model operations</p>
      <h1 className="ff-display mt-3 text-4xl font-semibold">Video model routing</h1>
      <p className="mt-3 max-w-3xl leading-7 text-[#91a0b8]">Refresh the live catalog, review the controls each model actually supports, then choose model preferences for each video style and finish level. New routes stay unavailable until a model has been reviewed.</p>
      <form action={refreshVideoModelCatalog} className="mt-6"><button className="ff-button-primary min-h-11 px-5">Refresh OpenRouter video catalog</button></form>
    </header>

    <section className="ff-card p-6 sm:p-8">
      <h2 className="ff-display text-2xl font-semibold">Routing preference</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">Preview selects the lowest-cost compatible model. Standard follows the reviewed preference order when possible. Premium requires a reviewed preferred model and a per-shot spending cap.</p>
      <form action={saveVideoRoutePolicy} className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <label className="text-sm font-medium">Video type<select name="videoType" className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3">{VIDEO_TYPES.map((type) => <option key={type} value={type}>{VIDEO_TYPE_LABELS[type]}</option>)}</select></label>
        <label className="text-sm font-medium">Finish level<select name="qualityTier" className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3"><option value="ECONOMY">Preview</option><option value="STANDARD">Standard</option><option value="PREMIUM">Premium</option></select></label>
        <label className="text-sm font-medium">Production path<select name="path" className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3"><option value="AI_VIDEO">AI video</option><option value="COMPOSITED">Video with designed overlays</option><option value="MOTION_GRAPHICS">Motion graphics renderer</option></select></label>
        <label className="text-sm font-medium">Maximum per shot (USD)<input name="maxCostUsd" type="number" min="0.01" step="0.01" placeholder="Use account cap" className="mt-2 h-11 w-full rounded-xl border border-border bg-background px-3" /></label>
        <label className="text-sm font-medium">Preferred models<select name="preferredModelIds" multiple size={4} className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2">{catalog.filter((model) => model.available && model.reviewedAt).map((model) => <option key={model.modelId} value={model.modelId}>{model.modelId}</option>)}</select></label>
        <button className="ff-button-primary min-h-11 px-5 md:col-span-2 xl:col-span-5">Save route preference</button>
      </form>
      {config.policies.length > 0 && <div className="mt-6 overflow-x-auto rounded-xl border border-border"><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-secondary/60"><tr><th className="p-3">Video type</th><th className="p-3">Finish</th><th className="p-3">Path</th><th className="p-3">Preferred models</th><th className="p-3">Updated</th></tr></thead><tbody>{config.policies.map((policy) => <tr key={policy._id} className="border-t border-border"><td className="p-3">{VIDEO_TYPE_LABELS[policy.videoType as VideoType]}</td><td className="p-3">{policy.qualityTier}</td><td className="p-3">{policy.path}</td><td className="max-w-sm p-3">{policy.preferredModelIds.join(' → ') || 'Automatic among eligible models'}</td><td className="p-3">{new Date(policy.updatedAt).toLocaleString()}</td></tr>)}</tbody></table></div>}
    </section>

    <section className="space-y-4">
      <div><h2 className="ff-display text-2xl font-semibold">Catalog models and reviewed controls</h2><p className="mt-2 text-sm text-muted-foreground">The catalog supplies duration, size, aspect ratio, and pricing. Review style and media controls before putting a model in a route.</p></div>
      {catalog.length === 0 ? <div className="ff-card p-6 text-sm text-muted-foreground">No video models are stored yet. Refresh the catalog to begin.</div> : catalog.map((model) => <form action={reviewVideoModelCapabilities} key={model._id} className="ff-card p-5 sm:p-6">
        <input type="hidden" name="modelId" value={model.modelId} />
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">{model.name || model.modelId}</h3><p className="mt-1 font-mono text-xs text-muted-foreground">{model.modelId}</p><p className="mt-2 text-xs text-muted-foreground">{model.supportedDurations.join(', ') || 'Durations not listed'} sec · {model.supportedResolutions.join(', ') || 'resolutions not listed'} · {model.supportedAspectRatios.join(', ') || 'aspect ratios not listed'} · sizes {model.supportedSizes?.join(', ') || 'not listed'}{model.estimatedCostPerSecond === undefined ? '' : ` · from $${model.estimatedCostPerSecond}/sec`}</p><p className="mt-2 text-xs text-muted-foreground">Pricing SKUs: {Object.entries(model.pricingSkus || {}).map(([sku, price]) => `${sku} $${price}`).join(' · ') || 'not listed'} · Provider passthrough: {model.supportedParameters.join(', ') || 'none listed'} · refreshed {new Date(model.lastSeenAt).toLocaleString()}</p></div><button className="rounded-xl border border-border px-4 py-2 text-sm font-semibold">Save capability review</button></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[['available', 'Available for routing', model.available], ...capabilityFields.map(([key, label]) => [key, label, model[key] as boolean])].map(([key, label, checked]) => <label key={String(key)} className="flex items-center gap-2 text-sm"><input type="checkbox" name={String(key)} defaultChecked={Boolean(checked)} className="size-4 accent-primary" />{String(label)}</label>)}</div><fieldset className="mt-5 border-t border-border pt-4"><legend className="px-1 text-sm font-semibold">Verified operations</legend><p className="mb-3 text-xs leading-5 text-muted-foreground">Enable advanced operations only after their endpoint contract and sample output have been reviewed. A catalog listing alone does not prove editing, voice, or performance preservation.</p><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{VIDEO_OPERATIONS.map((operation) => <label key={operation} className="flex items-center gap-2 text-sm"><input type="checkbox" name="reviewedOperations" value={operation} defaultChecked={model.reviewedOperations?.includes(operation) ?? false} className="size-4 accent-primary" />{operation.toLowerCase().replaceAll('_', ' ')}</label>)}</div></fieldset><p className="mt-3 text-xs leading-5 text-muted-foreground">Changing catalog controls invalidates the review. Required media, audio, masks, or frames are never silently dropped to use another model.</p>
      </form>)}
    </section>
  </div>;
}
