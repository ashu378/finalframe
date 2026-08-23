export const SUPPORTED_MOTION_TEMPLATE_IDS = ['kinetic-title'] as const;
export type MotionTemplateId = (typeof SUPPORTED_MOTION_TEMPLATE_IDS)[number];

export interface MotionTemplateProps {
  [key: string]: unknown;
}
