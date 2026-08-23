import type { ReactElement } from 'react';
import type { MotionGraphicsRenderItem } from '../types.js';
import { SUPPORTED_MOTION_TEMPLATE_IDS, type MotionTemplateId } from './contract.js';
import { KineticTitle, type KineticTitleProps } from './kinetic-title.js';

export function isSupportedMotionTemplateId(value: string): value is MotionTemplateId {
  return (SUPPORTED_MOTION_TEMPLATE_IDS as readonly string[]).includes(value);
}

export function renderMotionTemplate(item: MotionGraphicsRenderItem): ReactElement {
  if (item.templateId === 'kinetic-title') return <KineticTitle {...(item.props as unknown as KineticTitleProps)} />;
  throw new Error(`Unsupported motion-graphics template: ${item.templateId}`);
}
