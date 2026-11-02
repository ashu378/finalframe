/** Pure geometry. Rendering supplies real font measurements; complete text
 * either fits at a readable size or fails, without truncation. */
export interface GraphicBox {
    x: number;
    y: number;
    width: number;
    height: number;
}
export type GraphicTextMeasure = (text: string, fontSize: number) => number;
const positive = (value: number) => Number.isFinite(value) && value > 0;
export function graphicsSafeBox(width: number, height: number): GraphicBox { if (!positive(width) || !positive(height))
    throw new Error('Graphic dimensions must be finite and positive.'); const padding = Math.max(12, Math.min(width, height) * .06); if (width <= padding * 2 || height <= padding * 2)
    throw new Error('Graphic output is too small for a readable safe area.'); return { x: padding, y: padding, width: width - padding * 2, height: height - padding * 2 }; }
export function containGraphicImage(box: GraphicBox, sourceWidth: number, sourceHeight: number): GraphicBox { if (![box.width, box.height, sourceWidth, sourceHeight].every(positive))
    throw new Error('An exact screenshot needs measurable dimensions.'); const scale = Math.min(box.width / sourceWidth, box.height / sourceHeight), width = sourceWidth * scale, height = sourceHeight * scale; return { x: box.x + (box.width - width) / 2, y: box.y + (box.height - height) / 2, width, height }; }
export function normalizedGraphicBox(image: GraphicBox, focus: GraphicBox): GraphicBox { if ([focus.x, focus.y, focus.width, focus.height].some(n => !Number.isFinite(n)) || focus.x < 0 || focus.y < 0 || focus.width <= 0 || focus.height <= 0 || focus.x + focus.width > 1 + 1e-9 || focus.y + focus.height > 1 + 1e-9)
    throw new Error('The focus must fit the exact screenshot.'); return { x: image.x + image.width * focus.x, y: image.y + image.height * focus.y, width: image.width * focus.width, height: image.height * focus.height }; }
function wrapText(text: string, width: number, size: number, measure: GraphicTextMeasure): string[] {
    const lines: string[] = [];
    for (const paragraph of text.split('\n')) {
        let line = '';
        for (const token of paragraph.match(/\S+|\s+/gu) ?? []) {
            if (measure(line + token, size) <= width) {
                line += token;
                continue;
            }
            if (line) {
                lines.push(line);
                line = '';
            }
            for (const char of token) {
                if (measure(char, size) > width)
                    throw new Error('A graphic character cannot fit readably.');
                if (line && measure(line + char, size) > width) {
                    lines.push(line);
                    line = '';
                }
                line += char;
            }
        }
        lines.push(line);
    }
    return lines;
}
export function fitCompleteGraphicText(text: string, box: Pick<GraphicBox, 'width' | 'height'>, options: {
    minFontSize?: number;
    maxFontSize: number;
    maxLines: number;
    lineHeight?: number;
}, measure: GraphicTextMeasure) {
    const minimum = options.minFontSize ?? 12, maximum = Math.floor(options.maxFontSize), lineHeight = options.lineHeight ?? 1.2;
    if (!positive(box.width) || !positive(box.height) || !Number.isSafeInteger(minimum) || minimum < 12 || !Number.isSafeInteger(maximum) || maximum < minimum || !Number.isSafeInteger(options.maxLines) || options.maxLines < 1 || !positive(lineHeight))
        throw new Error('Graphic text layout needs a readable font and bounded box.');
    for (let fontSize = maximum; fontSize >= minimum; fontSize--) {
        let lines: string[];
        try {
            lines = wrapText(text, box.width, fontSize, measure);
        }
        catch {
            continue;
        }
        if (lines.length <= options.maxLines && lines.length * fontSize * lineHeight <= box.height && lines.every(line => { const width = measure(line, fontSize); return Number.isFinite(width) && width >= 0 && width <= box.width; }))
            return { fontSize, lineHeight, lineCount: lines.length, height: lines.length * fontSize * lineHeight };
    }
    throw new Error('The complete graphic text cannot fit readably. Shorten the text or choose a larger output.');
}
export function graphicBarGeometry(values: readonly number[], box: GraphicBox) { if (values.length < 2 || values.length > 8 || values.some(n => !Number.isFinite(n) || n < 0 || n > 1e9) || !positive(box.width) || !positive(box.height))
    throw new Error('Chart values and bounds are invalid.'); const maximum = Math.max(...values) || 1, slot = box.width / values.length; return values.map((value, i) => { const height = box.height * value / maximum; return { x: box.x + i * slot + slot * .15, y: box.y + box.height - height, width: slot * .7, height, value, label: String(value) }; }); }
export function graphicStepIndex(frame: number, frames: number, count: number, explicit?: number) { if (!Number.isSafeInteger(frame) || frame < 0 || !Number.isSafeInteger(frames) || frames < 1 || frame >= frames || !Number.isSafeInteger(count) || count < 2 || count > 4 || explicit !== undefined && (!Number.isSafeInteger(explicit) || explicit < 0 || explicit >= count))
    throw new Error('Step timing must be inside the exact graphic.'); return explicit ?? Math.min(count - 1, Math.floor(frame * count / frames)); }
export function graphicCursorPosition(frame: number, frames: number, image: GraphicBox, cursor: {
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    clickFrame: number;
}) { if (!Number.isSafeInteger(frame) || frame < 0 || !Number.isSafeInteger(frames) || frames < 1 || frame >= frames || !Number.isSafeInteger(cursor.clickFrame) || cursor.clickFrame < 0 || cursor.clickFrame >= frames || [cursor.fromX, cursor.fromY, cursor.toX, cursor.toY].some(n => !Number.isFinite(n) || n < 0 || n > 1))
    throw new Error('Cursor timing/position must fit the exact screenshot.'); const progress = cursor.clickFrame === 0 ? 1 : Math.min(1, frame / cursor.clickFrame); return { x: image.x + (cursor.fromX + (cursor.toX - cursor.fromX) * progress) * image.width, y: image.y + (cursor.fromY + (cursor.toY - cursor.fromY) * progress) * image.height, clicking: frame === cursor.clickFrame }; }
