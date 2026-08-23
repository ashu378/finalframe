import { Composition } from 'remotion';
import { fixtureManifest } from '../fixture.js';
import { FinalFrameComposition, type FinalFrameCompositionProps } from './composition.js';

export function RemotionRoot() {
  return (
    <Composition
      id="FinalFrameAssembly"
      component={FinalFrameComposition}
      durationInFrames={fixtureManifest.output.durationInFrames}
      fps={fixtureManifest.output.fps}
      width={fixtureManifest.output.width}
      height={fixtureManifest.output.height}
      defaultProps={{ manifest: fixtureManifest }}
    />
  );
}
