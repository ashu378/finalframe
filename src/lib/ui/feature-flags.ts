export type FeatureFlag =
  | 'creatorNavigation'
  | 'creationModes'
  | 'approvalReview'
  | 'friendlyStatuses'
  | 'workflowStepper';

export type FeatureFlagState = Readonly<Record<FeatureFlag, boolean>>;

/** Defaults keep the foundation available to new consumers; importing this file has no side effects. */
export const featureFlagDefaults: FeatureFlagState = {
  creatorNavigation: true,
  creationModes: true,
  approvalReview: true,
  friendlyStatuses: true,
  workflowStepper: true,
};

export type FeatureFlagOverrides = Partial<Record<FeatureFlag, boolean>>;

export function getFeatureFlags(overrides: FeatureFlagOverrides = {}): FeatureFlagState {
  return { ...featureFlagDefaults, ...overrides };
}

export function isFeatureEnabled(flag: FeatureFlag, overrides: FeatureFlagOverrides = {}): boolean {
  return getFeatureFlags(overrides)[flag];
}

export function withFeatureFlag<T>(
  flag: FeatureFlag,
  enabled: T,
  disabled: T,
  overrides: FeatureFlagOverrides = {},
): T {
  return isFeatureEnabled(flag, overrides) ? enabled : disabled;
}
