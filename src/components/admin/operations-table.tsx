import { CheckCircle2, CircleAlert, Clock3, ReceiptText, ScrollText } from 'lucide-react';

type OperationData = {
    jobs: Array<{ id: string; status: string; provider: string; model: string; createdAt: number; updatedAt: number; errorMessage?: string }>;
    payments: Array<{ id: string; status: string; provider: string; amount: number; currency: string; credits: number; createdAt: number }>;
    reservations: Array<{ id: string; status: string; amount: number; createdAt: number; expiresAt: number }>;
    audit: Array<{ id: string; action: string; entityType: string; entityId: string; createdAt: number }>;
};

type StatusTone = 'good' | 'pending' | 'attention' | 'neutral';

const date = (value: number) => new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
const normalized = (value: string) => value.trim().toUpperCase().replace(/[-\s]+/g, '_');

function paymentStatus(status: string): { label: string; detail: string; tone: StatusTone } {
    switch (normalized(status)) {
        case 'COMPLETED':
        case 'PAID':
        case 'SUCCEEDED':
        case 'CONFIRMED':
            return { label: 'Reconciled', detail: 'Payment confirmed and ready to audit.', tone: 'good' };
        case 'PENDING':
        case 'PROCESSING':
        case 'PENDING_CONFIRMATION':
            return { label: 'Awaiting confirmation', detail: 'The provider has not confirmed this payment yet.', tone: 'pending' };
        case 'FAILED':
        case 'CANCELED':
        case 'CANCELLED':
        case 'REFUNDED':
            return { label: normalized(status) === 'REFUNDED' ? 'Refunded' : 'Payment failed', detail: 'No new credit grant should be assumed.', tone: 'attention' };
        default:
            return { label: 'Needs review', detail: 'Check the provider event before closing this record.', tone: 'attention' };
    }
}

function reservationStatus(status: string): { label: string; detail: string; tone: StatusTone } {
    switch (normalized(status)) {
        case 'COMMITTED':
        case 'CONSUMED':
        case 'COMPLETED':
            return { label: 'Used', detail: 'Credits were committed to completed work.', tone: 'good' };
        case 'RELEASED':
        case 'EXPIRED':
            return { label: normalized(status) === 'EXPIRED' ? 'Expired' : 'Released', detail: 'Unused credits returned to the available balance.', tone: 'neutral' };
        case 'RESERVED':
        case 'HELD':
        case 'PENDING':
            return { label: 'Held', detail: 'Credits remain reserved until the job reaches an outcome.', tone: 'pending' };
        default:
            return { label: 'Needs review', detail: 'Confirm the ledger outcome before closing this reservation.', tone: 'attention' };
    }
}

function StatusBadge({ label, tone }: { label: string; tone: StatusTone }) {
    const styles = {
        good: 'bg-[#9be3c3] text-[#0b0d12]',
        pending: 'bg-[#86a7ff] text-[#0b0d12]',
        attention: 'bg-[#ff9e9e] text-[#0b0d12]',
        neutral: 'bg-[#1c2533] text-[#eaf0fa]',
    } satisfies Record<StatusTone, string>;

    return <span className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${styles[tone]}`}>{tone === 'good' ? <CheckCircle2 className="size-3" aria-hidden="true" /> : tone === 'attention' ? <CircleAlert className="size-3" aria-hidden="true" /> : <Clock3 className="size-3" aria-hidden="true" />}{label}</span>;
}

export function OperationsTable({ data, kind }: { data: OperationData; kind: 'jobs' | 'payments' | 'credits' | 'audit' }) {
    if (kind === 'jobs') return <section className="studio-card overflow-hidden"><div className="border-b border-[#263143]/45 p-6"><div className="flex items-center gap-3"><Clock3 className="size-5 text-[#86a7ff]" aria-hidden="true" /><div><h2 className="font-semibold">Generation jobs</h2><p className="mt-1 text-sm text-[#91a0b8]">Live job records from Convex.</p></div></div></div>{data.jobs.length ? <div className="divide-y divide-[#263143]/30">{data.jobs.map((job) => <div key={String(job.id)} className="grid gap-2 px-6 py-5 sm:grid-cols-[1fr_auto] sm:items-center"><div><p className="text-sm font-semibold">{job.provider} · {job.model}</p><p className="mt-1 text-xs text-[#91a0b8]">Created {date(job.createdAt)}</p>{job.errorMessage && <p className="mt-2 text-sm text-[#ff9e9e]">{job.errorMessage}</p>}</div><span className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${job.status === 'FAILED' ? 'bg-[#ff9e9e] text-[#0b0d12]' : job.status === 'COMPLETED' ? 'bg-[#9be3c3] text-[#0b0d12]' : 'bg-[#86a7ff] text-[#0b0d12]'}`}>{job.status === 'FAILED' ? <CircleAlert className="size-3" aria-hidden="true" /> : <CheckCircle2 className="size-3" aria-hidden="true" />}{job.status}</span></div>)}</div> : <EmptyOperations label="No generation jobs yet." />}</section>;

    if (kind === 'payments') return <section className="studio-card overflow-hidden"><div className="border-b border-[#263143]/45 p-6"><div className="flex items-start gap-3"><ReceiptText className="mt-0.5 size-5 text-[#86a7ff]" aria-hidden="true" /><div><h2 className="font-semibold">Payment reconciliation</h2><p className="mt-1 text-sm leading-6 text-[#91a0b8]">Verified purchases, pending confirmations, and payment events that need review.</p></div></div></div>{data.payments.length ? <div className="divide-y divide-[#263143]/30">{data.payments.map((payment) => { const status = paymentStatus(payment.status); return <div key={String(payment.id)} className="grid gap-4 px-6 py-5 lg:grid-cols-[1fr_auto] lg:items-center"><div><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold">{payment.provider} · {payment.currency} {payment.amount.toFixed(2)}</p><StatusBadge label={status.label} tone={status.tone} /></div><p className="mt-2 text-xs text-[#91a0b8]">{payment.credits.toLocaleString()} credits · {date(payment.createdAt)}</p><p className="mt-2 text-sm leading-6 text-[#91a0b8]">{status.detail}</p></div><div className="rounded-xl bg-[#1c2533] px-4 py-3 text-xs text-[#91a0b8] lg:min-w-52"><p className="font-semibold text-[#eaf0fa]">Event reference</p><p className="mt-1 break-all">{payment.id}</p></div></div>; })}</div> : <EmptyOperations label="No payment events have been recorded yet." />}</section>;

    if (kind === 'credits') return <section className="studio-card overflow-hidden"><div className="border-b border-[#263143]/45 p-6"><div className="flex items-start gap-3"><Clock3 className="mt-0.5 size-5 text-[#86a7ff]" aria-hidden="true" /><div><h2 className="font-semibold">Credit reconciliation</h2><p className="mt-1 text-sm leading-6 text-[#91a0b8]">Track held, used, released, and expired credits. Every reservation should end in a clear ledger outcome.</p></div></div></div>{data.reservations.length ? <div className="divide-y divide-[#263143]/30">{data.reservations.map((reservation) => { const status = reservationStatus(reservation.status); return <div key={String(reservation.id)} className="grid gap-4 px-6 py-5 lg:grid-cols-[1fr_auto] lg:items-center"><div><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold">{reservation.amount.toLocaleString()} credits</p><StatusBadge label={status.label} tone={status.tone} /></div><p className="mt-2 text-xs text-[#91a0b8]">Created {date(reservation.createdAt)} · expires {date(reservation.expiresAt)}</p><p className="mt-2 text-sm leading-6 text-[#91a0b8]">{status.detail}</p></div><div className="rounded-xl bg-[#1c2533] px-4 py-3 text-xs text-[#91a0b8] lg:min-w-52"><p className="font-semibold text-[#eaf0fa]">Reservation reference</p><p className="mt-1 break-all">{reservation.id}</p></div></div>; })}</div> : <EmptyOperations label="No credit reservations have been recorded yet." />}</section>;

    return <section className="studio-card overflow-hidden"><div className="border-b border-[#263143]/45 p-6"><div className="flex items-center gap-3"><ScrollText className="size-5 text-[#86a7ff]" aria-hidden="true" /><div><h2 className="font-semibold">Audit trail</h2><p className="mt-1 text-sm text-[#91a0b8]">Administrative and system events from Convex.</p></div></div></div>{data.audit.length ? <div className="divide-y divide-[#263143]/30">{data.audit.map((event) => <div key={String(event.id)} className="px-6 py-5"><p className="text-sm font-semibold">{event.action}</p><p className="mt-1 text-xs text-[#91a0b8]">{event.entityType} · {event.entityId} · {date(event.createdAt)}</p></div>)}</div> : <EmptyOperations label="No audit events are available." />}</section>;
}

function EmptyOperations({ label }: { label: string }) {
    return <div className="flex min-h-40 items-center justify-center px-6 text-center text-sm text-[#91a0b8]"><span>{label}</span></div>;
}
