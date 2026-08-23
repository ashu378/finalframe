import { AbsoluteFill, Sequence, Video } from 'remotion';
import type { RenderManifest } from '../types.js';
import { renderMotionTemplate } from '../templates/renderer.js';

export interface FinalFrameCompositionProps {
  manifest: RenderManifest;
}

export function FinalFrameComposition({ manifest }: FinalFrameCompositionProps) {
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {manifest.items.map((item) => (
        <Sequence key={item.id} from={item.startFrame} durationInFrames={item.durationInFrames} layout="none">
          {item.kind === 'video' ? (
            <Video
              src={item.src}
              startFrom={item.trimStartInFrames ?? 0}
              volume={item.volume ?? 1}
              style={{ width: '100%', height: '100%', opacity: item.opacity ?? 1, objectFit: 'cover' }}
            />
          ) : (
            <AbsoluteFill style={{ opacity: item.opacity ?? 1 }}>{renderMotionTemplate(item)}</AbsoluteFill>
          )}
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
