import type { CreditPack } from './types';

export const CREDIT_PACKS: CreditPack[] = [
    // Launch values are configuration placeholders. Replace with approved
    // merchant/currency pricing before enabling live checkout.
    { id: 'starter', label: 'Starter', amounts: { XAF: 500, XOF: 500, NGN: 500 }, credits: 100 },
    { id: 'creator', label: 'Creator', amounts: { XAF: 1000, XOF: 1000, NGN: 1000 }, credits: 240 },
    { id: 'studio', label: 'Studio', amounts: { XAF: 2000, XOF: 2000, NGN: 2000 }, credits: 520 },
];
