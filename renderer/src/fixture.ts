import fixtureJson from '../fixtures/kinetic-title.json' with { type: 'json' };
import { assertValidManifest } from './manifest.js';

export const fixtureManifest = assertValidManifest(fixtureJson);
