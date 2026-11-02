import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { AbsoluteFill, Img, cancelRender, continueRender, delayRender, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import type { MotionGraphicsRenderItem } from '../types.js';
import { parseGraphicsV2Render, type GraphicsV2Props } from './graphics-v2-contract.js';
import { containGraphicImage, graphicBarGeometry, graphicCursorPosition, graphicStepIndex, graphicsSafeBox, normalizedGraphicBox, type GraphicBox } from './graphics-v2-layout.js';
const FONT = 'Arial, Helvetica, sans-serif';
const absolute = (box: GraphicBox): CSSProperties => ({ position: 'absolute', left: box.x, top: box.y, width: box.width, height: box.height, boxSizing: 'border-box' });
function Text({ text, box, maxFontSize, lines = 3, color, weight = 700 }: {
    text: string;
    box: GraphicBox;
    maxFontSize: number;
    lines?: number;
    color?: string;
    weight?: number;
}) {
    const [handle] = useState(() => delayRender('Checking full graphic text'));
    const [size, setSize] = useState<number | null>(null);
    useLayoutEffect(() => {
        let canceled = false;
        void document.fonts.ready.then(() => {
            if (canceled)
                return;
            const el = document.createElement('div');
            Object.assign(el.style, { position: 'absolute', left: '-100000px', top: '0', width: box.width + 'px', fontFamily: FONT, fontWeight: String(weight), lineHeight: '1.2', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' });
            el.textContent = text;
            document.body.appendChild(el);
            try {
                let fitted: number | undefined;
                for (let font = Math.floor(maxFontSize); font >= 12; font--) {
                    el.style.fontSize = font + 'px';
                    if (el.getBoundingClientRect().height <= Math.min(box.height, lines * font * 1.2) + .5 && el.scrollWidth <= box.width + .5) {
                        fitted = font;
                        break;
                    }
                }
                if (fitted === undefined)
                    throw new Error('The complete graphic text cannot fit readably. Shorten it or choose a larger output.');
                setSize(fitted);
            }
            catch (error) {
                cancelRender(error instanceof Error ? error : new Error('Graphic layout failed.'));
            }
            finally {
                el.remove();
            }
        });
        return () => { canceled = true; continueRender(handle); };
    }, [text, box.width, box.height, maxFontSize, lines, weight, handle]);
    useLayoutEffect(() => { if (size !== null)
        continueRender(handle); }, [size, handle]);
    return size === null ? null : <div data-graphic-text={text} style={{ ...absolute(box), fontFamily: FONT, fontSize: size, fontWeight: weight, lineHeight: 1.2, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color }}>{text}</div>;
}
function OptionalText(props: Parameters<typeof Text>[0]) { return props.text ? <Text {...props}/> : null; }
function ProductUI({ props, box, titleSize, frames }: {
    props: GraphicsV2Props;
    box: GraphicBox;
    titleSize: number;
    frames: number;
}) {
    const frame = useCurrentFrame(), ref = useRef<HTMLImageElement>(null);
    const [handle] = useState(() => delayRender('Measuring the exact project screenshot'));
    const [dimensions, setDimensions] = useState<[
        number,
        number
    ] | null>(null);
    const header = Math.max(24, box.height * .2), sub = props.subtitle ? Math.max(24, box.height * .12) : 0, gap = 8;
    const imageBox = { x: box.x, y: box.y + header + sub + gap, width: box.width, height: box.height - header - sub - gap };
    if (imageBox.height < 24)
        throw new Error('The screenshot needs a larger readable output.');
    const image = dimensions ? containGraphicImage(imageBox, ...dimensions) : imageBox;
    useLayoutEffect(() => { if (dimensions)
        continueRender(handle); }, [dimensions, handle]);
    useLayoutEffect(() => () => continueRender(handle), [handle]);
    const focus = dimensions && props.focus ? normalizedGraphicBox(image, props.focus) : null;
    const cursor = dimensions && props.cursor ? graphicCursorPosition(frame, frames, image, props.cursor) : null;
    return <><Text text={props.title} box={{ ...box, height: header }} maxFontSize={titleSize} lines={2}/><OptionalText text={props.subtitle ?? ''} box={{ ...box, y: box.y + header, height: sub }} maxFontSize={Math.max(14, titleSize * .45)} lines={2}/>
    <Img ref={ref} src={props.screenUrl!} onLoad={event => { const { naturalWidth, naturalHeight } = event.currentTarget; if (!naturalWidth || !naturalHeight)
        cancelRender(new Error('The exact screenshot cannot be measured.'));
    else
        setDimensions([naturalWidth, naturalHeight]); }} onError={() => cancelRender(new Error('The approved screenshot could not load.'))} style={{ ...absolute(image), objectFit: 'contain', opacity: dimensions ? 1 : 0 }}/>
    {focus && <div data-graphic-focus style={{ ...absolute(focus), border: `2px solid ${props.accentColor ?? '#87a8ff'}`, pointerEvents: 'none' }}/>}
    {cursor && <svg data-graphic-cursor data-clicking={cursor.clicking} width={20} height={26} viewBox="0 0 20 26" style={{ position: 'absolute', left: cursor.x, top: cursor.y, overflow: 'visible' }}><path d="M0 0L0 21L6 16L10 25L14 23L10 14L18 14Z" fill="#ffffff" stroke="#111722" strokeWidth="1.5"/>{cursor.clicking && <circle cx="0" cy="0" r="10" fill="none" stroke={props.accentColor ?? '#87a8ff'} strokeWidth="3"/>}</svg>}
  </>;
}
export function GraphicsV2({ item }: {
    item: MotionGraphicsRenderItem;
}) {
    const { width, height, fps } = useVideoConfig(), frame = useCurrentFrame();
    const { templateId, props: p } = useMemo(() => parseGraphicsV2Render(item.templateId, item.props, item.durationInFrames, fps), [item.templateId, item.props, item.durationInFrames, fps]);
    const box = graphicsSafeBox(width, height), titleSize = Math.max(18, Math.min(96, box.width * .095)), bodySize = Math.max(14, Math.min(32, box.width * .045));
    const accent = p.accentColor ?? '#87a8ff', titleHeight = Math.max(26, box.height * .22), gap = Math.max(6, box.height * .025);
    let content;
    if (templateId === 'product-ui')
        content = <ProductUI props={p} box={box} titleSize={titleSize} frames={item.durationInFrames}/>;
    else if (templateId === 'bar-chart') {
        const footer = Math.max(p.sourceNote ? 48 : 30, box.height * .18), valuesHeight = Math.max(18, box.height * .08);
        const plot = { x: box.x, y: box.y + titleHeight + gap + valuesHeight, width: box.width, height: box.height - titleHeight - gap - valuesHeight - footer };
        if (plot.height < 12)
            throw new Error('The chart needs a larger readable output.');
        const bars = graphicBarGeometry(p.series!.map(s => s.value), plot), progress = item.durationInFrames === 1 ? 1 : interpolate(frame, [0, Math.min(15, item.durationInFrames - 1)], [0, 1], { extrapolateRight: 'clamp' });
        content = <><Text text={p.title} box={{ ...box, height: titleHeight }} maxFontSize={titleSize} lines={2}/>{bars.map((bar, index) => <div key={index}><div data-graphic-bar={String(bar.value)} style={{ ...absolute({ ...bar, y: plot.y + plot.height - bar.height * progress, height: bar.height * progress }), backgroundColor: accent }}/><Text text={bar.label + (p.unit ? ' ' + p.unit : '')} box={{ x: bar.x - 3, y: plot.y - valuesHeight, width: bar.width + 6, height: valuesHeight }} maxFontSize={bodySize} lines={1}/><Text text={p.series![index].label} box={{ x: bar.x - 3, y: plot.y + plot.height + 3, width: bar.width + 6, height: footer * .65 }} maxFontSize={bodySize} lines={2}/></div>)}<div style={{ position: 'absolute', left: plot.x, top: plot.y + plot.height, width: plot.width, borderTop: `1px solid ${p.textColor ?? '#ffffff'}` }}/><OptionalText text={p.sourceNote ?? ''} box={{ x: box.x, y: box.y + box.height - Math.max(15, footer * .3), width: box.width, height: Math.max(15, footer * .3) }} maxFontSize={Math.max(12, bodySize * .65)} lines={1}/></>;
    }
    else if (templateId === 'explainer-steps') {
        const count = p.steps!.length, active = graphicStepIndex(frame, item.durationInFrames, count, p.activeStep), vertical = height > width, available = box.height - titleHeight - gap;
        content = <><Text text={p.title} box={{ ...box, height: titleHeight }} maxFontSize={titleSize} lines={2}/>{p.steps!.map((step, index) => { const cell = vertical ? { x: box.x, y: box.y + titleHeight + gap + index * available / count, width: box.width, height: available / count - gap } : { x: box.x + index * box.width / count, y: box.y + titleHeight + gap, width: box.width / count - gap, height: available }; const padding = Math.min(10, cell.width * .05), inner = { x: cell.x + padding, y: cell.y + padding, width: cell.width - 2 * padding, height: cell.height - 2 * padding }, heading = Math.max(24, inner.height * .35); return <div key={index}><div data-graphic-step={index} data-active={index === active} style={{ ...absolute(cell), border: `2px solid ${index === active ? accent : '#738199'}`, borderRadius: 8, background: index === active ? accent + '18' : 'transparent' }}/><Text text={`${index + 1}. ${step.heading}`} box={{ ...inner, height: heading }} maxFontSize={bodySize} lines={3}/><OptionalText text={step.detail ?? ''} box={{ ...inner, y: inner.y + heading, height: inner.height - heading }} maxFontSize={Math.max(12, bodySize * .8)} lines={5}/></div>; })}</>;
    }
    else {
        const header = Math.max(20, box.height * .12), footer = templateId === 'end-card' ? Math.max(48, box.height * .24) : 0;
        const titleY = box.y + header + gap, titleH = (box.height - header - footer - 2 * gap) * (p.subtitle || p.detail ? .58 : .95), title = templateId === 'feature-callout' ? [p.index ? `${p.index}. ${p.title}` : p.title, ...(p.feature && p.feature !== p.title ? [p.feature] : [])].join('\n') : p.title;
        const logoWidth = p.logoUrl ? Math.min(box.width * .25, header * 2) : 0;
        content = <>{p.logoUrl && <Img src={p.logoUrl} style={{ ...absolute({ x: box.x, y: box.y, width: logoWidth, height: header }), objectFit: 'contain' }}/>}<OptionalText text={[p.brandName, p.eyebrow].filter(Boolean).join(' · ')} box={{ x: box.x + logoWidth + (logoWidth ? gap : 0), y: box.y, width: box.width - logoWidth - (logoWidth ? gap : 0), height: header }} maxFontSize={bodySize} lines={1} color={accent}/><Text text={title} box={{ x: box.x, y: titleY, width: box.width, height: titleH }} maxFontSize={titleSize} lines={4}/><OptionalText text={[p.subtitle, p.detail].filter(Boolean).join('\n')} box={{ x: box.x, y: titleY + titleH + gap, width: box.width, height: box.height - header - titleH - footer - 3 * gap }} maxFontSize={bodySize} lines={4}/>{templateId === 'end-card' && <><div style={{ ...absolute({ x: box.x, y: box.y + box.height - footer, width: box.width, height: footer * .55 }), backgroundColor: accent, borderRadius: 6 }}/><Text text={p.callToAction!} box={{ x: box.x + 6, y: box.y + box.height - footer + 2, width: box.width - 12, height: footer * .55 - 4 }} maxFontSize={bodySize} lines={1} color="#101722"/><OptionalText text={p.url ?? ''} box={{ x: box.x, y: box.y + box.height - footer * .35, width: box.width, height: footer * .35 }} maxFontSize={Math.max(12, bodySize * .7)} lines={1}/></>}</>;
    }
    const reveal = item.durationInFrames === 1 ? 1 : interpolate(frame, [0, Math.min(18, item.durationInFrames - 1)], [0, 1], { extrapolateRight: 'clamp' });
    const animated = ['kinetic-title', 'brand-card', 'feature-callout', 'end-card'].includes(templateId);
    return <AbsoluteFill data-graphics-v2={templateId} style={{ backgroundColor: p.backgroundColor ?? '#111722', color: p.textColor ?? '#f5f7fb', fontFamily: FONT }}><AbsoluteFill style={animated ? { opacity: reveal, transform: `translateY(${(1 - reveal) * Math.min(24, height * .04)}px)` } : {}}>{content}</AbsoluteFill></AbsoluteFill>;
}
