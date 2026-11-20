import { Password } from '@convex-dev/auth/providers/Password';

// ConvexCredentials stores the real authorize callback inside `options`.
// Flatten it before wrapping: provider materialization otherwise overwrites
// our throttling/feature-gate callback with the original callback.
export function materializePassword(provider: ReturnType<typeof Password>) {
  const { options, ...base } = provider as typeof provider & { options: Partial<typeof provider> };
  return { ...base, ...options };
}
