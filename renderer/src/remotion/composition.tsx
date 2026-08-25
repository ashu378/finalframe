import { AbsoluteFill, Audio, Img, Sequence, Video, interpolate, useCurrentFrame } from 'remotion';
import { createAssemblyPlan } from '../assembly/plan.js';
import type { RenderManifest } from '../types.js';
import { renderMotionTemplate } from '../templates/renderer.js';

export interface FinalFrameCompositionProps extends Record<string, unknown> {
  manifest: RenderManifest;
}

export function FinalFrameComposition({ manifest }: FinalFrameCompositionProps) {
  const frame = useCurrentFrame();
  const plan = createAssemblyPlan(manifest);
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {plan.items.map((item) => (
        <Sequence key={item.id} from={item.startFrame} durationInFrames={item.durationInFrames} layout="none">
          {item.kind === 'video' ? (
            <Video
              src={item.src}
              startFrom={item.trimStartInFrames ?? 0}
              volume={item.volume ?? 1}
              style={{ width: '100%', height: '100%', opacity: item.opacity ?? 1, objectFit: 'cover' }}
            />
          ) : item.kind === 'image' ? (
            <Img
              src={item.src}
              style={{
                width: '100%',
                height: '100%',
                opacity: item.opacity ?? 1,
                objectFit: item.fit ?? 'cover',
                objectPosition: item.position ?? 'center',
              }}
            />
          ) : item.kind === 'motion-graphics' ? (
            <AbsoluteFill style={{ opacity: item.opacity ?? 1 }}>{renderMotionTemplate(item)}</AbsoluteFill>
          ) : null}
        </Sequence>
      ))}
      {plan.audioTracks.map((track) => (
        <Sequence key={`audio-${track.id}`} from={track.startFrame} durationInFrames={track.durationInFrames} layout="none">
          <Audio
            src={track.src}
            startFrom={track.trimStartInFrames ?? 0}
            volume={(currentFrame) => {
              const localFrame = currentFrame;
              const fadeIn = track.fadeInFrames ? interpolate(localFrame, [0, track.fadeInFrames], [0, track.volume ?? 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : track.volume ?? 1;
              const fadeOutStart = Math.max(0, track.durationInFrames - (track.fadeOutFrames ?? 0));
              return track.fadeOutFrames ? Math.min(fadeIn, interpolate(localFrame, [fadeOutStart, track.durationInFrames], [track.volume ?? 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })) : fadeIn;
            }}
          />
        </Sequence>
      ))}
      {plan.captionTracks.flatMap((track) => track.cues).map((cue) => {
        const visible = frame >= cue.startFrame && frame < cue.startFrame + cue.durationInFrames;
        if (!visible) return null;
        return (
          <div
            key={`caption-${cue.id}`}
            aria-label={cue.text}
            style={{
              position: 'absolute',
              left: '8%',
              right: '8%',
              bottom: '8%',
              color: '#fff',
              fontFamily: 'Arial, Helvetica, sans-serif',
              fontSize: 42,
              fontWeight: 700,
              lineHeight: 1.15,
              textAlign: 'center',
              textShadow: '0 2px 4px rgba(0,0,0,.9), 0 0 12px rgba(0,0,0,.7)',
            }}
          >
            {cue.text}
          </div>
        );
      })}
    </AbsoluteFill>
  );
}
