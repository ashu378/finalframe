import { parseGraphicsV2Authoring, type GraphicsV2TemplateId } from './templates/graphics-v2-contract.js';

export const FORMAT_VARIANT_VERSION = 1;
export interface VariantFraming { fit: 'contain' | 'cover'; focalPoint: { x: number; y: number }; backgroundColor: string }

export function variantFraming(value: unknown): VariantFraming {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const fit = input.fit ?? 'contain';
  const point = (input.focalPoint ?? { x: .5, y: .5 }) as Record<string, unknown>;
  const backgroundColor = input.backgroundColor ?? '#000000';
  if (!['contain', 'cover'].includes(String(fit)) || !point || typeof point !== 'object' ||
      typeof point.x !== 'number' || !Number.isFinite(point.x) || point.x < 0 || point.x > 1 ||
      typeof point.y !== 'number' || !Number.isFinite(point.y) || point.y < 0 || point.y > 1 ||
      typeof backgroundColor !== 'string' || !/^#[0-9a-f]{6}$/i.test(backgroundColor)) throw new Error('FORMAT_FRAMING_INVALID');
  return { fit: fit as VariantFraming['fit'], focalPoint: { x: point.x, y: point.y }, backgroundColor };
}

export function framingRenderProps(value: VariantFraming) {
  const framing = variantFraming(value);
  return { fit: framing.fit, position: `${framing.focalPoint.x * 100}% ${framing.focalPoint.y * 100}%`, backgroundColor: framing.backgroundColor };
}

/** A variant reflows authored graphics; saved source manifests keep their layout. */
export function variantGraphic(template: string, props: Record<string, unknown>, durationFrames: number, fps: number, assetId?: string) {
  let templateId = template as GraphicsV2TemplateId;
  const allowed = ['title', 'subtitle', 'eyebrow', 'brandName', 'accentColor', 'backgroundColor', 'textColor', 'feature', 'detail', 'index', 'callToAction', 'url'];
  const next = props.layoutVersion === 2 ? { ...props } : Object.fromEntries(allowed.filter(key => props[key] !== undefined).map(key => [key, props[key]]));
  delete next.logoUrl;
  delete next.screenUrl;
  if (templateId === 'end-card' && !next.callToAction) templateId = 'kinetic-title';
  next.layoutVersion = 2;
  return parseGraphicsV2Authoring({ templateId, props: next, ...(assetId ? { [templateId === 'product-ui' ? 'screenAssetId' : 'logoAssetId']: assetId } : {}) }, durationFrames, fps);
}

export function formatVariantRequirements(manifest: unknown): boolean {
  if (!manifest || typeof manifest !== 'object') return false;
  const raw=manifest as Record<string, unknown>;
  const metadata = raw.metadata as Record<string, unknown> | undefined;
  const variant = metadata?.formatVariant as Record<string, unknown> | undefined;
  return variant?.version === FORMAT_VARIANT_VERSION || raw.version===5 && Array.isArray(raw.items) && raw.items.some(value=>{
    if(!value||typeof value!=='object')return false;
    const item=value as Record<string,unknown>;
    return item.backgroundColor!==undefined||item.kind==='video'&&(item.fit!==undefined||item.position!==undefined);
  });
}

