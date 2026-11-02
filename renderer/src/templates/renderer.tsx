import type { ReactElement } from 'react';
import type { MotionGraphicsRenderItem } from '../types.js';
import { SUPPORTED_MOTION_TEMPLATE_IDS, type MotionTemplateId } from './contract.js';
import { KineticTitle, type KineticTitleProps } from './kinetic-title.js';
import { GraphicsV2 } from './graphics-v2.js';
import { renderGraphicCard } from './graphic-cards.js';

export function isSupportedMotionTemplateId(value: string): value is MotionTemplateId {
  return (SUPPORTED_MOTION_TEMPLATE_IDS as readonly string[]).includes(value);
}

export function renderMotionTemplate(item: MotionGraphicsRenderItem): ReactElement {
  if (item.props.layoutVersion === 2) return <GraphicsV2 item={item} />;
  if (item.templateId === 'kinetic-title') return <KineticTitle {...(item.props as unknown as KineticTitleProps)} />;
  const graphicCard = renderGraphicCard(item.templateId, item.props);
  if (graphicCard) return graphicCard;
  throw new Error(`Unsupported motion-graphics template: ${item.templateId}`);
}
