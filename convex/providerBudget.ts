import { internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";

// Owner-approved cumulative ceiling, including prior keys and retained holds.
// Raised explicitly to $25 on 2026-11-12; existing usage is never reset.
const MAX_TEST_MICROS = 25_000_000;

export function usdToMicros(value: number) {
  if (!Number.isFinite(value) || value < 0 || !Number.isSafeInteger(Math.ceil(value * 1_000_000))) {
    throw new Error("A finite provider cost estimate is required.");
  }
  return Math.ceil(value * 1_000_000);
}

/** Trusted deployment administration only; no public browser endpoint can
 * create a budget, increase its limit, or add an allowed studio. */
export const configure = internalMutation({
  args: { key: v.string(), limitUsd: v.number(), allowedStudioExternalIds: v.array(v.string()), active: v.boolean() },
  returns: v.id("providerBudgets"),
  handler: async (ctx, args) => {
    const key = args.key.trim();
    const limitMicros = usdToMicros(args.limitUsd);
    if (key.length < 8 || key.length > 120 || limitMicros <= 0 || limitMicros > MAX_TEST_MICROS) throw new Error("Testing budget must be positive and at most US$25.");
    const studios = [...new Set(args.allowedStudioExternalIds.map((id) => id.trim()).filter(Boolean))];
    if (!studios.length || studios.length > 10) throw new Error("Explicit test studios are required.");
    for (const studioId of studios) {
      if (!await ctx.db.query("studios").withIndex("by_external_id", (q) => q.eq("externalId", studioId)).unique()) throw new Error("Test studio not found.");
    }
    const existing = await ctx.db.query("providerBudgets").withIndex("by_key", (q) => q.eq("key", key)).unique();
    // Creating a new key must not reset a previous run's approved allowance.
    const all = await ctx.db.query("providerBudgets").take(101);
    if (all.length > 100 || all.reduce((sum, row) => sum + (row._id === existing?._id ? 0 : row.limitMicros), limitMicros) > MAX_TEST_MICROS) throw new Error("The total approved testing allowance is US$25.");
    if (existing) {
      if (limitMicros < existing.spentMicros + existing.reservedMicros) throw new Error("Budget cannot be reduced below committed funds.");
      await ctx.db.patch(existing._id, { limitMicros, allowedStudioExternalIds: studios, status: args.active ? "ACTIVE" : "PAUSED", updatedAt: Date.now() });
      return existing._id;
    }
    return await ctx.db.insert("providerBudgets", { key, limitMicros, spentMicros: 0, reservedMicros: 0, allowedStudioExternalIds: studios, status: args.active ? "ACTIVE" : "PAUSED", createdAt: Date.now(), updatedAt: Date.now() });
  },
});

export const inspect = internalQuery({
  args: { key: v.string() },
  returns: v.any(),
  handler: async (ctx, args) => await ctx.db.query("providerBudgets").withIndex("by_key", (q) => q.eq("key", args.key)).unique(),
});

/** Called in the same transaction as job/credit creation. No external API is
 * called before this reservation exists. Unknown estimates fail closed. */
export async function reserveProviderBudget(ctx: MutationCtx, args: {
  jobId?: Id<"generationJobs">; studioExternalId: string; estimatedCostUsd: number; idempotencyKey: string;
  /** Internal no-cost verification supplies an isolated budget. Never accept
   * this override in a public request validator. */
  budgetKey?: string;
}) {
  const estimatedMicros = usdToMicros(args.estimatedCostUsd);
  if (estimatedMicros <= 0) throw new Error("A positive provider cost estimate is required.");
  const runKey = args.budgetKey ?? process.env.FINALFRAME_PAID_TEST_RUN?.trim();
  if (!runKey) throw new Error("Paid testing is not enabled.");
  const budget = await ctx.db.query("providerBudgets").withIndex("by_key", (q) => q.eq("key", runKey)).unique();
  if (!budget || budget.status !== "ACTIVE" || !budget.allowedStudioExternalIds.includes(args.studioExternalId)) throw new Error("This studio is not enabled for capped paid testing.");
  const existing = await ctx.db.query("providerBudgetReservations").withIndex("by_idempotency", (q) => q.eq("idempotencyKey", args.idempotencyKey)).unique();
  if (existing) {
    if (existing.budgetId !== budget._id || existing.jobId !== args.jobId || existing.studioExternalId !== args.studioExternalId || existing.estimatedMicros !== estimatedMicros || existing.status !== "RESERVED") throw new Error("Provider reservation conflicts with another request.");
    return existing._id;
  }
  if (budget.spentMicros + budget.reservedMicros + estimatedMicros > budget.limitMicros) throw new Error("This request would exceed the approved testing budget.");
  await ctx.db.patch(budget._id, { reservedMicros: budget.reservedMicros + estimatedMicros, updatedAt: Date.now() });
  return await ctx.db.insert("providerBudgetReservations", { budgetId: budget._id, jobId: args.jobId, studioExternalId: args.studioExternalId, idempotencyKey: args.idempotencyKey, estimatedMicros, status: "RESERVED", createdAt: Date.now(), updatedAt: Date.now() });
}

export const verifyNoCost = internalMutation({
  args: { fixtureKey: v.string() },
  returns: v.object({ checks: v.array(v.string()), providerCalls: v.number() }),
  handler: async (ctx, args) => {
    if (process.env.FINALFRAME_DEV_FIXTURES !== "true" || process.env.FINALFRAME_DEV_FIXTURE_ENV !== "development" || !process.env.FINALFRAME_DEV_FIXTURE_KEY || args.fixtureKey !== process.env.FINALFRAME_DEV_FIXTURE_KEY) throw new Error("Development fixture authorization is required.");
    const checks: string[] = [];
    const key = `budget-check-${crypto.randomUUID()}`;
    const budgetId = await ctx.db.insert("providerBudgets", { key, limitMicros: 10_000, reservedMicros: 0, spentMicros: 0, allowedStudioExternalIds: [key], status: "ACTIVE", createdAt: Date.now(), updatedAt: Date.now() });
    const input = { budgetKey: key, studioExternalId: key, estimatedCostUsd: 0.006, idempotencyKey: `${key}:one` };
    const reservationId = await reserveProviderBudget(ctx, input);
    if (await reserveProviderBudget(ctx, input) !== reservationId) throw new Error("Duplicate provider reservation.");
    checks.push("idempotent provider reservation");
    let denied = false;
    try { await reserveProviderBudget(ctx, { ...input, idempotencyKey: `${key}:two` }); } catch { denied = true; }
    if (!denied) throw new Error("Budget overrun was accepted.");
    checks.push("aggregate budget overrun denied");
    denied = false;
    try { await reserveProviderBudget(ctx, { ...input, studioExternalId: "other-studio" }); } catch { denied = true; }
    if (!denied) throw new Error("Wrong studio was accepted.");
    checks.push("unapproved studio denied");
    await settleProviderBudget(ctx, { reservationId, accepted: true });
    if ((await ctx.db.get(budgetId))?.reservedMicros !== 6000) throw new Error("Ambiguous submission released funds.");
    checks.push("accepted unknown cost remains reserved");
    await settleProviderBudget(ctx, { reservationId, accepted: true, actualCostUsd: 0.004 });
    await settleProviderBudget(ctx, { reservationId, accepted: true, actualCostUsd: 0.004 });
    const settled = await ctx.db.get(budgetId);
    if (settled?.spentMicros !== 4000 || settled.reservedMicros !== 0) throw new Error("Settlement is not idempotent.");
    checks.push("settlement applied exactly once");
    const second = await reserveProviderBudget(ctx, { ...input, idempotencyKey: `${key}:two` });
    await settleProviderBudget(ctx, { reservationId: second, accepted: false });
    const released = await ctx.db.get(budgetId);
    if (released?.spentMicros !== 4000 || released.reservedMicros !== 0) throw new Error("Rejected submission did not release its hold.");
    checks.push("unaccepted submission releases hold");
    // These are transient arithmetic fixtures, not payment/credit records.
    // Never leave synthetic spend in the real testing allowance.
    await ctx.db.delete(reservationId); await ctx.db.delete(second); await ctx.db.delete(budgetId);
    return { checks, providerCalls: 0 };
  },
});

/** An accepted or ambiguous request without reported cost keeps its funds
 * reserved until reconciliation. This deliberately cannot free spending room. */
export async function settleProviderBudget(ctx: MutationCtx, args: {
  reservationId: Id<"providerBudgetReservations">; accepted: boolean; actualCostUsd?: number;
}) {
  const reservation = await ctx.db.get(args.reservationId);
  if (!reservation) throw new Error("Provider reservation not found.");
  if (reservation.status === "SETTLED" || reservation.status === "RELEASED") return reservation.status;
  const budget = await ctx.db.get(reservation.budgetId);
  if (!budget) throw new Error("Provider budget not found.");
  if (args.accepted && args.actualCostUsd === undefined) {
    await ctx.db.patch(reservation._id, { status: "RECONCILIATION_REQUIRED", updatedAt: Date.now() });
    return "RECONCILIATION_REQUIRED" as const;
  }
  const actualMicros = args.accepted ? usdToMicros(args.actualCostUsd!) : 0;
  const spentMicros = budget.spentMicros + actualMicros;
  const reservedMicros = budget.reservedMicros - reservation.estimatedMicros;
  if (reservedMicros < 0) throw new Error("Provider reservation invariant failed.");
  await ctx.db.patch(budget._id, { spentMicros, reservedMicros, status: spentMicros + reservedMicros > budget.limitMicros ? "PAUSED" : budget.status, updatedAt: Date.now() });
  const status = args.accepted ? "SETTLED" as const : "RELEASED" as const;
  await ctx.db.patch(reservation._id, { status, actualMicros, updatedAt: Date.now() });
  return status;
}
