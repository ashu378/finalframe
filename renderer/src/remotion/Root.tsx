import { Composition, type AnyZodObject } from 'remotion';
import { fixtureManifest } from '../fixture.js';
import { FinalFrameComposition, type FinalFrameCompositionProps } from './composition.js';

export function RemotionRoot() {
  return (
    <Composition<AnyZodObject, FinalFrameCompositionProps>
      id="FinalFrameAssembly"
      component={FinalFrameComposition}
      durationInFrames={fixtureManifest.output.durationInFrames}
      fps={fixtureManifest.output.fps}
      width={fixtureManifest.output.width}
      height={fixtureManifest.output.height}
      defaultProps={{ manifest: fixtureManifest }}
      calculateMetadata={({ props }: { props: FinalFrameCompositionProps }) => ({
        durationInFrames: props.manifest.output.durationInFrames,
        fps: props.manifest.output.fps,
        width: props.manifest.output.width,
        height: props.manifest.output.height,
      })}
    />
  );
}
