/** Owner-approved direction only: not a checkout catalog or activation flag. */
export const PAYMENT_LAUNCH_POLICY = {
  minimumTopUpUsd: 3,
  packAmountsUsd: [3, 5, 10, 20, 25, 30, 35, 40, 45, 50],
  subscriptionRequired: false,
  purchasedCreditsExpire: false,
  changeOfMindRefunds: false,
} as const;
