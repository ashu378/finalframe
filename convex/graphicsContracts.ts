import { parseGraphicsV2Authoring } from '../renderer/src/templates/graphics-v2-contract';
export const graphicsV2Enabled = () => process.env.FINALFRAME_GRAPHICS_V2_ENABLED === 'true' && process.env.FINALFRAME_MANIFEST_V5_ENABLED === 'true';
export { parseGraphicsV2Authoring };
