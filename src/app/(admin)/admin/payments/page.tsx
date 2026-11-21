import Link from 'next/link';
import { requirePlatformRole } from '@/lib/guards/platform';
import { PAYMENT_LAUNCH_POLICY } from '@/lib/payments/launch-policy';

export const metadata = { title: 'Payment readiness' };

export default async function PaymentReadinessPage() {
  await requirePlatformRole(['ADMIN']);
  return <div className="space-y-8">
    <header className="border-b border-border pb-7">
      <Link href="/admin" className="ff-link text-sm">Platform overview</Link>
      <p className="mt-6 text-sm text-muted-foreground">Owner-only payment readiness</p>
      <h1 className="ff-display mt-3 text-balance text-4xl font-semibold">Finish the app. Payments come last.</h1>
      <p className="mt-4 max-w-2xl text-pretty text-sm leading-7 text-muted-foreground">Live payments have not been activated. The existing sandbox uses simulated money and separate test credits. This page records the launch policy; it cannot start a charge or turn payments on.</p>
    </header>
    <section className="rounded-2xl border border-border bg-card p-5 sm:p-7" aria-labelledby="payment-policy-title">
      <h2 id="payment-policy-title" className="text-xl font-semibold">Buy credits when you need them</h2>
      <p className="mt-3 text-sm leading-7 text-muted-foreground">Start at ${PAYMENT_LAUNCH_POLICY.minimumTopUpUsd}. No monthly subscription. Purchased credits stay available until used, with no expiry.</p>
      <ul aria-label="Planned top-up amounts in US dollars" className="mt-5 flex flex-wrap gap-2">{PAYMENT_LAUNCH_POLICY.packAmountsUsd.map(amount => <li key={amount} className="rounded-xl border border-border bg-background px-4 py-3 text-sm font-semibold tabular-nums">${amount}</li>)}</ul>
      <p className="mt-4 text-xs leading-6 text-muted-foreground">Planned amounts, not active offers. Credit quantities, local-currency amounts, taxes and fees still need final cost checks. Existing balances and sandbox packs have not changed.</p>
    </section>
    <section className="rounded-2xl border border-border bg-card p-5 sm:p-7" aria-labelledby="refund-policy-title">
      <h2 id="refund-policy-title" className="text-xl font-semibold">Credits stay in the account</h2>
      <p className="mt-3 text-sm leading-7 text-muted-foreground">No routine cash refunds for changing your mind. Unused purchased credits remain available. Duplicate charges and refunds required by applicable law are handled separately. A technical generation failure returns the eligible credits; that is different from a cash refund.</p>
    </section>
    <section className="rounded-2xl border border-border bg-card p-5 sm:p-7" aria-labelledby="payment-launch-title">
      <h2 id="payment-launch-title" className="text-xl font-semibold">Before real payments</h2>
      <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm leading-7 text-muted-foreground"><li>Finish the app and its remaining acceptance checks.</li><li>Verify operation costs and set the credits charged.</li><li>Complete real purchase accounting, refund exceptions and purchase history.</li><li>Confirm merchant details, fees and published terms.</li><li>Get the owner’s approval for live activation and a small real payment test.</li></ol>
    </section>
    <Link href="/admin/credits" className="ff-button-quiet min-h-11">View credit history</Link>
  </div>;
}
