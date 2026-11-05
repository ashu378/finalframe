import { AbsoluteFill, Audio, Freeze, Img, Sequence, Video, interpolate, useCurrentFrame } from 'remotion';
import { createAssemblyPlan } from '../assembly/plan.js';
import type { RenderManifest, VideoRenderItem } from '../types.js';
import { renderMotionTemplate } from '../templates/renderer.js';
import { useMemo } from 'react';
import { nativeVideoVolume, visualPresentation } from '../assembly/transitions.js';
import { CaptionLayer } from './caption-layer.js';

export interface FinalFrameCompositionProps extends Record<string, unknown> {
  manifest: RenderManifest;
}

function SourceVideo({item,version,volume}:{item:VideoRenderItem;version:number;volume:number|((frame:number)=>number)}){
  const frame=useCurrentFrame();
  const video=<Video src={item.src} startFrom={item.trimStartInFrames??0} volume={volume} style={{width:'100%',height:'100%',objectFit:version===5?item.fit??'cover':'cover',objectPosition:version===5?item.position??'center':'center'}}/>;
  return version===5&&item.holdAfterFrame!==undefined&&frame>=item.holdAfterFrame?<Freeze frame={item.holdAfterFrame-1}>{video}</Freeze>:video;
}

export function FinalFrameComposition({ manifest }: FinalFrameCompositionProps) {
  const frame = useCurrentFrame();
  const plan = useMemo(() => createAssemblyPlan(manifest), [manifest]);
  const captionCues = useMemo(() => plan.captionTracks.flatMap(track => track.cues.map(cue => ({ ...cue, trackId: track.id }))), [plan]);
  const transitions = useMemo(() => ({ incoming: new Map(plan.transitions.map(transition => [transition.toItemId, transition])), outgoing: new Map(plan.transitions.map(transition => [transition.fromItemId, transition])) }), [plan]);
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {plan.items.map((item) => {
        const incoming = transitions.incoming.get(item.id);
        const outgoing = transitions.outgoing.get(item.id);
        const crossfade = incoming?.audioPolicy === 'CROSSFADE' || outgoing?.audioPolicy === 'CROSSFADE';
        return (
        <Sequence key={item.id} from={item.startFrame} durationInFrames={item.durationInFrames} layout="none">
          <AbsoluteFill style={{...visualPresentation(item, frame, incoming, outgoing),...(plan.version===5&&item.backgroundColor?{backgroundColor:item.backgroundColor}:{})}}>
          {item.kind === 'video' ? (
            <SourceVideo item={item} version={plan.version} volume={crossfade ? localFrame => nativeVideoVolume(item.volume ?? 1, item.startFrame + localFrame, incoming, outgoing) : item.volume ?? 1}/>
          ) : item.kind === 'image' ? (
            <Img
              src={item.src}
              style={{
                width: '100%',
                height: '100%',
                objectFit: item.fit ?? 'cover',
                objectPosition: item.position ?? 'center',
              }}
            />
          ) : item.kind === 'motion-graphics' ? (
            <AbsoluteFill>{renderMotionTemplate(item)}</AbsoluteFill>
          ) : null}
          </AbsoluteFill>
        </Sequence>
      ); })}
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
      {plan.version === 5 ? <CaptionLayer key={plan.manifestId} tracks={plan.captionTracks} width={plan.width} height={plan.height} /> : captionCues.map((cue) => {
        const visible = frame >= cue.startFrame && frame < cue.startFrame + cue.durationInFrames;
        if (!visible) return null;
        return (
          <div
            key={`caption-${cue.trackId}-${cue.id}`}
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
