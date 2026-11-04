export const SUPPORTED_MOTION_TEMPLATE_IDS = ['kinetic-title', 'brand-card', 'feature-callout', 'end-card', 'product-ui', 'bar-chart', 'explainer-steps'] as const;
export type MotionTemplateId = (typeof SUPPORTED_MOTION_TEMPLATE_IDS)[number];
export const AUTHORED_COPY_POLICY = 'authored-only';

export interface MotionTemplateProps {
  [key: string]: unknown;
}
