const MARKER = 'finalframe-dev-fixture-v1';

export function assertFixtureMode() {
  if (process.env.FINALFRAME_DEV_FIXTURES !== 'true' || process.env.FINALFRAME_DEV_FIXTURE_ENV !== 'development') {
    throw new Error('Fake providers require FINALFRAME_DEV_FIXTURES=true and FINALFRAME_DEV_FIXTURE_ENV=development.');
  }
  if (process.env.NODE_ENV === 'production') throw new Error('Fake providers are disabled in production.');
}

export function createFixturePlan() {
  assertFixtureMode();
  return {
    bible: {
      projectContext: { title: 'FinalFrame deterministic fixture', format: 'studio smoke test' },
      characters: [],
      locations: [{ name: 'Fixture Stage', description: 'A neutral production stage.' }],
      products: [],
      style: { visualLanguage: 'clean deterministic title card', palette: ['#0b1020', '#cbd5e1'] },
      story: { logline: 'A deterministic fixture verifies the production pipeline without provider spend.' },
    },
    sequences: [{
      title: 'Fixture Sequence 01',
      description: 'One sequence used by the live no-cost verification.',
      orderIndex: 0,
      scenes: [{
        title: 'Fixture Scene 01',
        purpose: 'Verify scene, shot, take, timeline, and export relationships.',
        visualDirection: 'A dark slate title card with restrained white typography.',
        orderIndex: 0,
        shots: [
          { title: 'Fixture Shot 01', prompt: 'Show the deterministic FinalFrame fixture title card.', durationSeconds: 2, orderIndex: 0, camera: { kind: 'static' }, requiredAssetIds: [] },
          { title: 'Fixture Shot 02', prompt: 'Hold the same deterministic fixture media for a second shot.', durationSeconds: 2, orderIndex: 1, camera: { kind: 'static' }, requiredAssetIds: [] },
        ],
      }],
    }],
    metadata: { fixtureMarker: MARKER, generatedBy: 'fake-planner', providerCalls: 0 },
  };
}

export function createFixtureAdapters() {
  assertFixtureMode();
  const response = (kind, payload) => ({ provider: 'finalframe-fixture', model: `fixture/${kind}`, requestId: `${MARKER}:${kind}`, cost: 0, latencyMs: 0, payload });
  return {
    planner: { plan: async () => response('planner', createFixturePlan()) },
    transcriber: { transcribe: async () => response('transcriber', { text: 'FinalFrame fixture transcript', segments: [] }) },
    image: { generate: async () => response('image', { assetKind: 'fixture-image' }) },
    voice: { synthesize: async () => response('voice', { assetKind: 'fixture-audio' }) },
    video: { generate: async () => response('video', { assetKind: 'fixture-video' }) },
  };
}

export function fixtureProviderNames() {
  return ['planner', 'transcriber', 'image', 'voice', 'video'].map((capability) => ({ capability, provider: 'finalframe-fixture', cost: 0 }));
}
