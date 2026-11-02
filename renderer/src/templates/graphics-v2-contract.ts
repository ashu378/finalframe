/** Pure graphics contract. Authoring uses canonical project asset IDs;
 * assembly alone resolves render media URLs. Existing templates stay readable. */
export const GRAPHICS_V2_TEMPLATE_IDS = ['kinetic-title', 'brand-card', 'feature-callout', 'end-card', 'product-ui', 'bar-chart', 'explainer-steps'] as const;
export type GraphicsV2TemplateId = typeof GRAPHICS_V2_TEMPLATE_IDS[number];
export interface GraphicsV2Focus {
    x: number;
    y: number;
    width: number;
    height: number;
}
export interface GraphicsV2Cursor {
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    clickFrame: number;
}
export interface GraphicsV2Series {
    label: string;
    value: number;
}
export interface GraphicsV2Step {
    heading: string;
    detail?: string;
}
export interface GraphicsV2Props {
    layoutVersion: 2;
    title: string;
    subtitle?: string;
    eyebrow?: string;
    brandName?: string;
    accentColor?: string;
    backgroundColor?: string;
    textColor?: string;
    feature?: string;
    detail?: string;
    index?: string;
    callToAction?: string;
    url?: string;
    screenFit?: 'contain';
    focus?: GraphicsV2Focus;
    cursor?: GraphicsV2Cursor;
    series?: GraphicsV2Series[];
    unit?: string;
    sourceNote?: string;
    steps?: GraphicsV2Step[];
    activeStep?: number;
    logoUrl?: string;
    screenUrl?: string;
}
export interface GraphicsV2Spec {
    templateId: GraphicsV2TemplateId;
    props: GraphicsV2Props;
    assetId?: string;
    assetRole?: 'logo' | 'screen';
}
export const GRAPHICS_V2_LIMITS = { maxBytes: 24576, maxTitle: 240, maxSubtitle: 500, maxSeries: 8, maxSteps: 4, maxValue: 1e9, minFontSize: 12 } as const;
const fail = (field: string, reason: string): never => { throw new Error(`Graphic ${field}: ${reason}`); };
function object(value: unknown, field: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value)))
        return fail(field, 'must be an object');
    return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: readonly string[], field: string) { if (Object.keys(value).some(key => !allowed.includes(key)))
    fail(field, 'contains unsupported properties'); }
export function graphicPlainText(value: unknown, field: string, max: number, required = false): string | undefined {
    if (value === undefined && !required)
        return undefined;
    if (typeof value !== 'string' || value.length > max || required && !value.trim() || /[\u0000-\u0008\u000b-\u001f\u007f]/.test(value) || /<\/?[a-z!][^>]*>/i.test(value))
        return fail(field, `use ${required ? 'nonempty ' : ''}plain text of at most ${max} characters`);
    return value;
}
function number(value: unknown, field: string, min: number, max: number, integer = false) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || integer && !Number.isSafeInteger(value))
        return fail(field, `must be ${integer ? 'an integer' : 'finite'} between ${min} and ${max}`);
    return value;
}
function asset(value: unknown, field: string) { if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(value))
    return fail(field, 'choose a canonical project asset'); return value; }
function media(value: unknown, field: string) {
    if (typeof value !== 'string' || !value || value.length > 2048 || /[\u0000\r\n]/.test(value))
        return fail(field, 'requires stored media');
    // Fixture local paths still undergo the existing worker source/root policy.
    if (value.startsWith('/') && !value.startsWith('//'))
        return value;
    let url: URL;
    try {
        url = new URL(value);
    }
    catch {
        return fail(field, 'requires an absolute stored media URL');
    }
    if (!['https:', 'file:'].includes(url.protocol) || url.username || url.password || url.hash)
        return fail(field, 'requires safe stored media without credentials or fragments');
    return value;
}
function validate(templateId: unknown, raw: unknown, durationInFrames: number, fps: number, render: boolean): GraphicsV2Spec {
    number(fps, 'fps', 1, 60, true);
    number(durationInFrames, 'durationInFrames', 1, 60 * fps, true);
    if (typeof templateId !== 'string' || !(GRAPHICS_V2_TEMPLATE_IDS as readonly string[]).includes(templateId))
        return fail('templateId', 'is unsupported');
    const p = object(raw, 'props');
    let size: number;
    try {
        size = new TextEncoder().encode(JSON.stringify(p)).length;
    }
    catch {
        return fail('props', 'requires bounded JSON');
    }
    if (size > GRAPHICS_V2_LIMITS.maxBytes)
        fail('props', 'exceeds 24KiB');
    const common = ['layoutVersion', 'title', 'subtitle', 'eyebrow', 'brandName', 'accentColor', 'backgroundColor', 'textColor'];
    const extras: Record<GraphicsV2TemplateId, string[]> = {
        'kinetic-title': [], 'brand-card': render ? ['logoUrl'] : [],
        'feature-callout': ['feature', 'detail', 'index', ...(render ? ['logoUrl'] : [])],
        'end-card': ['callToAction', 'url', ...(render ? ['logoUrl'] : [])],
        'product-ui': ['screenFit', 'focus', 'cursor', ...(render ? ['screenUrl'] : [])],
        'bar-chart': ['series', 'unit', 'sourceNote'], 'explainer-steps': ['steps', 'activeStep'],
    };
    const shared = ['product-ui', 'bar-chart', 'explainer-steps'].includes(templateId) ? common.filter(key => !['eyebrow', 'brandName'].includes(key) && (key !== 'subtitle' || templateId === 'product-ui')) : common;
    keys(p, [...shared, ...extras[templateId as GraphicsV2TemplateId]], 'props');
    if (p.layoutVersion !== 2)
        fail('layoutVersion', 'must equal 2');
    graphicPlainText(p.title, 'title', 240, true);
    graphicPlainText(p.subtitle, 'subtitle', 500);
    graphicPlainText(p.eyebrow, 'eyebrow', 80);
    graphicPlainText(p.brandName, 'brandName', 160);
    for (const key of ['accentColor', 'backgroundColor', 'textColor'])
        if (p[key] !== undefined && (typeof p[key] !== 'string' || !/^#[a-f0-9]{6}$/i.test(p[key] as string)))
            fail(key, 'use a six-digit hexadecimal color');
    if (templateId === 'feature-callout') {
        graphicPlainText(p.feature, 'feature', 240, true);
        graphicPlainText(p.detail, 'detail', 500);
        graphicPlainText(p.index, 'index', 12);
    }
    if (templateId === 'end-card') {
        graphicPlainText(p.callToAction, 'callToAction', 80, true);
        graphicPlainText(p.url, 'url', 200);
    }
    if (p.logoUrl !== undefined)
        media(p.logoUrl, 'logoUrl');
    if (templateId === 'product-ui') {
        if (p.screenFit !== 'contain')
            fail('screenFit', 'must equal contain; preserve the full screenshot');
        if (render)
            media(p.screenUrl, 'screenUrl');
        if (p.focus !== undefined) {
            const f = object(p.focus, 'focus');
            keys(f, ['x', 'y', 'width', 'height'], 'focus');
            const x = number(f.x, 'focus.x', 0, 1), y = number(f.y, 'focus.y', 0, 1), width = number(f.width, 'focus.width', 0.000001, 1), height = number(f.height, 'focus.height', 0.000001, 1);
            if (x + width > 1 + 1e-9 || y + height > 1 + 1e-9)
                fail('focus', 'must fit inside the exact screenshot');
        }
        if (p.cursor !== undefined) {
            const c = object(p.cursor, 'cursor');
            keys(c, ['fromX', 'fromY', 'toX', 'toY', 'clickFrame'], 'cursor');
            for (const key of ['fromX', 'fromY', 'toX', 'toY'])
                number(c[key], 'cursor.' + key, 0, 1);
            number(c.clickFrame, 'cursor.clickFrame', 0, durationInFrames - 1, true);
        }
    }
    if (templateId === 'bar-chart') {
        graphicPlainText(p.unit, 'unit', 24);
        graphicPlainText(p.sourceNote, 'sourceNote', 200);
        if (!Array.isArray(p.series) || p.series.length < 2 || p.series.length > 8)
            fail('series', 'requires 2 to 8 values');
        for (const [i, rawSeries] of (p.series as unknown[]).entries()) {
            const row = object(rawSeries, 'series');
            keys(row, ['label', 'value'], 'series');
            graphicPlainText(row.label, `series[${i}].label`, 40, true);
            number(row.value, `series[${i}].value`, 0, 1e9);
        }
    }
    if (templateId === 'explainer-steps') {
        if (!Array.isArray(p.steps) || p.steps.length < 2 || p.steps.length > 4)
            fail('steps', 'requires 2 to 4 steps');
        for (const [i, rawStep] of (p.steps as unknown[]).entries()) {
            const row = object(rawStep, 'steps');
            keys(row, ['heading', 'detail'], 'steps');
            graphicPlainText(row.heading, `steps[${i}].heading`, 80, true);
            graphicPlainText(row.detail, `steps[${i}].detail`, 180);
        }
        if (p.activeStep !== undefined)
            number(p.activeStep, 'activeStep', 0, (p.steps as unknown[]).length - 1, true);
    }
    return { templateId: templateId as GraphicsV2TemplateId, props: JSON.parse(JSON.stringify(p)) as GraphicsV2Props };
}
export function parseGraphicsV2Authoring(raw: unknown, frames: number, fps: number): GraphicsV2Spec {
    const input = object(raw, 'spec');
    keys(input, ['templateId', 'props', 'logoAssetId', 'screenAssetId'], 'spec');
    const spec = validate(input.templateId, input.props, frames, fps, false);
    if (spec.templateId === 'product-ui') {
        if (input.logoAssetId !== undefined)
            fail('logoAssetId', 'use a separate brand card; the UI card binds one screenshot');
        return { ...spec, assetId: asset(input.screenAssetId, 'screenAssetId'), assetRole: 'screen' };
    }
    if (input.screenAssetId !== undefined)
        fail('screenAssetId', 'is supported only by product-ui');
    if (input.logoAssetId !== undefined) {
        if (!['brand-card', 'feature-callout', 'end-card'].includes(spec.templateId))
            fail('logoAssetId', 'is unsupported on this template');
        return { ...spec, assetId: asset(input.logoAssetId, 'logoAssetId'), assetRole: 'logo' };
    }
    return spec;
}
export function parseGraphicsV2Render(templateId: unknown, props: unknown, frames: number, fps: number): GraphicsV2Spec { return validate(templateId, props, frames, fps, true); }
