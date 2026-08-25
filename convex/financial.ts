import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { requireAdmin, requireMember } from "./authorization";
import { now } from "./_shared";

type ReadCtx = QueryCtx | MutationCtx;
type ReservationState = "RESERVED" | "COMMITTED" | "RELEASED" | "EXPIRED" | "RECONCILIATION_REQUIRED";

function object(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function requireKey(value: string) {
  const key = value.trim();
  if (key.length < 8 || key.length > 200) throw new Error("Idempotency key must be between 8 and 200 characters.");
  return key;
}

async function getStudioForMember(ctx: ReadCtx, studioExternalId: string) {
  return await requireMember(ctx, studioExternalId);
}

async function wallet(ctx: MutationCtx, member: Awaited<ReturnType<typeof requireMember>>) {
  const existing = await ctx.db.query("credits").withIndex("by_studio", (q) => q.eq("studioExternalId", member.studio.externalId)).unique();
  if (existing) return existing;
  const timestamp = now();
  const id = await ctx.db.insert("credits", { studioExternalId: member.studio.externalId, studioId: member.studio._id, balance: Math.max(0, member.studio.credits), reserved: 0, currency: "credits", createdAt: timestamp, updatedAt: timestamp });
  return await ctx.db.get(id);
}

async function changeWallet(ctx: MutationCtx, member: Awaited<ReturnType<typeof requireMember>>, availableDelta: number, reservedDelta: number) {
  const current = await wallet(ctx, member);
  if (!current) throw new Error("Credit wallet could not be initialized.");
  const balance = current.balance + availableDelta;
  const reserved = current.reserved + reservedDelta;
  if (balance < 0) throw new Error("Insufficient credits.");
  if (reserved < 0) throw new Error("Credit reservation invariant failed.");
  await ctx.db.patch(current._id, { balance, reserved, updatedAt: now() });
  // Keep the old studio projection aligned for legacy read paths. It is not
  // used as an authorization source or as the canonical ledger.
  await ctx.db.patch(member.studio._id, { credits: balance, updatedAt: now() });
  return { balance, reserved };
}

async function ledgerForReservation(ctx: ReadCtx, reservation: { _id: Id<"reservations">; studioExternalId: string }) {
  return (await ctx.db.query("ledger").withIndex("by_studio", (q) => q.eq("studioExternalId", reservation.studioExternalId)).collect()).filter((entry) => entry.reservationId === reservation._id);
}

function reservationState(entries: Array<{ entryType: string }>): ReservationState {
  if (entries.some((entry) => entry.entryType === "RECONCILIATION_REQUIRED")) return "RECONCILIATION_REQUIRED";
  if (entries.some((entry) => entry.entryType === "COMMIT")) return "COMMITTED";
  if (entries.some((entry) => entry.entryType === "EXPIRE")) return "EXPIRED";
  if (entries.some((entry) => entry.entryType === "RELEASE")) return "RELEASED";
  return "RESERVED";
}

async function appendLedger(ctx: MutationCtx, args: { studioExternalId: string; studioId?: Id<"studios">; entryType: string; amount: number; sourceType: string; sourceId?: string; idempotencyKey: string; reservationId?: Id<"reservations">; purchaseId?: Id<"purchases">; refundId?: Id<"refunds">; metadata?: unknown }) {
  const existing = await ctx.db.query("ledger").withIndex("by_idempotency", (q) => q.eq("idempotencyKey", args.idempotencyKey)).unique();
  if (existing) return existing;
  const id = await ctx.db.insert("ledger", { studioExternalId: args.studioExternalId, studioId: args.studioId, entryType: args.entryType, amount: args.amount, sourceType: args.sourceType, sourceId: args.sourceId, idempotencyKey: args.idempotencyKey, reservationId: args.reservationId, purchaseId: args.purchaseId, refundId: args.refundId, metadata: args.metadata ?? {}, createdAt: now() });
  return await ctx.db.get(id);
}

async function canonicalReservation(ctx: ReadCtx, reservationId: Id<"reservations">) {
  const reservation = await ctx.db.get(reservationId);
  if (!reservation) throw new Error("Reservation not found.");
  const member = await requireMember(ctx, reservation.studioExternalId);
  return { reservation, member };
}

export const getWallet = query({
  args: { studioExternalId: v.string() },
  handler: async (ctx, args) => {
    const member = await getStudioForMember(ctx, args.studioExternalId);
    const current = await ctx.db.query("credits").withIndex("by_studio", (q) => q.eq("studioExternalId", member.studio.externalId)).unique();
    return current ?? { balance: Math.max(0, member.studio.credits), reserved: 0, studioExternalId: member.studio.externalId };
  },
});

export const getBalance = query({
  args: { studioExternalId: v.string() },
  handler: async (ctx, args) => {
    const member = await getStudioForMember(ctx, args.studioExternalId);
    const current = await ctx.db.query("credits").withIndex("by_studio", (q) => q.eq("studioExternalId", member.studio.externalId)).unique();
    return current?.balance ?? Math.max(0, member.studio.credits);
  },
});

export const reserve = mutation({
  args: { studioExternalId: v.string(), amount: v.number(), idempotencyKey: v.string(), generationJobId: v.optional(v.id("generationJobs")), renderJobId: v.optional(v.id("renderJobs")), estimateId: v.optional(v.id("estimates")), expiresInMs: v.optional(v.number()), metadata: v.optional(v.any()) },
  handler: async (ctx, args) => {
    const member = await getStudioForMember(ctx, args.studioExternalId);
    const idempotencyKey = requireKey(args.idempotencyKey);
    if (!Number.isInteger(args.amount) || args.amount <= 0) throw new Error("Credit amount must be a positive integer.");
    const existing = await ctx.db.query("reservations").withIndex("by_idempotency", (q) => q.eq("idempotencyKey", idempotencyKey)).unique();
    if (existing) {
      if (existing.studioExternalId !== member.studio.externalId || existing.amount !== args.amount) throw new Error("Reservation idempotency key is already used for a different amount or studio.");
      const entries = await ledgerForReservation(ctx, existing);
      return { reservationId: existing._id, status: reservationState(entries), amount: existing.amount, expiresAt: existing.expiresAt };
    }
    const timestamp = now();
    const reservationId = await ctx.db.insert("reservations", { studioExternalId: member.studio.externalId, studioId: member.studio._id, estimateId: args.estimateId, generationJobId: args.generationJobId, renderJobId: args.renderJobId, amount: args.amount, idempotencyKey, reservedAt: timestamp, expiresAt: timestamp + Math.min(Math.max(args.expiresInMs ?? 30 * 60 * 1000, 60_000), 24 * 60 * 60 * 1000), createdAt: timestamp });
    await changeWallet(ctx, member, -args.amount, args.amount);
    await appendLedger(ctx, { studioExternalId: member.studio.externalId, studioId: member.studio._id, entryType: "RESERVE", amount: -args.amount, sourceType: "RESERVATION", sourceId: reservationId.toString(), idempotencyKey: `reserve:${idempotencyKey}`, reservationId, metadata: args.metadata });
    return { reservationId, status: "RESERVED" as const, amount: args.amount, expiresAt: timestamp + Math.min(Math.max(args.expiresInMs ?? 30 * 60 * 1000, 60_000), 24 * 60 * 60 * 1000) };
  },
});

export const commit = mutation({
  args: { reservationId: v.id("reservations"), actualAmount: v.optional(v.number()), idempotencyKey: v.optional(v.string()), metadata: v.optional(v.any()) },
  handler: async (ctx, args) => {
    const { reservation, member } = await canonicalReservation(ctx, args.reservationId);
    const entries = await ledgerForReservation(ctx, reservation);
    const state = reservationState(entries);
    if (state !== "RESERVED") return { reservationId: reservation._id, status: state };
    const actual = args.actualAmount ?? reservation.amount;
    if (!Number.isInteger(actual) || actual < 0 || actual > reservation.amount) {
      await appendLedger(ctx, { studioExternalId: member.studio.externalId, studioId: member.studio._id, entryType: "RECONCILIATION_REQUIRED", amount: 0, sourceType: "RESERVATION", sourceId: reservation._id.toString(), idempotencyKey: `reconcile-required:${reservation._id}`, reservationId: reservation._id, metadata: { actualAmount: actual, reservedAmount: reservation.amount } });
      return { reservationId: reservation._id, status: "RECONCILIATION_REQUIRED" as const };
    }
    const releaseAmount = reservation.amount - actual;
    await changeWallet(ctx, member, releaseAmount, -reservation.amount);
    if (releaseAmount > 0) await appendLedger(ctx, { studioExternalId: member.studio.externalId, studioId: member.studio._id, entryType: "RELEASE", amount: releaseAmount, sourceType: "RESERVATION", sourceId: reservation._id.toString(), idempotencyKey: `commit-release:${reservation._id}`, reservationId: reservation._id, metadata: { actualAmount: actual } });
    await appendLedger(ctx, { studioExternalId: member.studio.externalId, studioId: member.studio._id, entryType: "COMMIT", amount: 0, sourceType: "RESERVATION", sourceId: reservation._id.toString(), idempotencyKey: args.idempotencyKey ? requireKey(args.idempotencyKey) : `commit:${reservation._id}`, reservationId: reservation._id, metadata: { actualAmount: actual, ...object(args.metadata) } });
    return { reservationId: reservation._id, status: "COMMITTED" as const, actualAmount: actual, releasedAmount: releaseAmount };
  },
});

export const release = mutation({
  args: { reservationId: v.id("reservations"), reason: v.optional(v.string()), expired: v.optional(v.boolean()), idempotencyKey: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { reservation, member } = await canonicalReservation(ctx, args.reservationId);
    const entries = await ledgerForReservation(ctx, reservation);
    const state = reservationState(entries);
    if (state !== "RESERVED") return { reservationId: reservation._id, status: state };
    const entryType = args.expired ? "EXPIRE" : "RELEASE";
    await changeWallet(ctx, member, reservation.amount, -reservation.amount);
    await appendLedger(ctx, { studioExternalId: member.studio.externalId, studioId: member.studio._id, entryType, amount: reservation.amount, sourceType: "RESERVATION", sourceId: reservation._id.toString(), idempotencyKey: args.idempotencyKey ? requireKey(args.idempotencyKey) : `${entryType.toLowerCase()}:${reservation._id}`, reservationId: reservation._id, metadata: { reason: args.reason } });
    return { reservationId: reservation._id, status: (args.expired ? "EXPIRED" : "RELEASED") as ReservationState };
  },
});

export const finalize = mutation({
  args: { reservationId: v.id("reservations"), outcome: v.union(v.literal("COMMIT"), v.literal("RELEASE")), actualAmount: v.optional(v.number()) },
  handler: async (ctx, args) => args.outcome === "COMMIT" ? await commitInTransaction(ctx, args.reservationId, args.actualAmount) : await releaseInTransaction(ctx, args.reservationId),
});

async function commitInTransaction(ctx: MutationCtx, reservationId: Id<"reservations">, actualAmount?: number) {
  const { reservation, member } = await canonicalReservation(ctx, reservationId);
  const entries = await ledgerForReservation(ctx, reservation);
  const state = reservationState(entries);
  if (state !== "RESERVED") return state;
  const actual = actualAmount ?? reservation.amount;
  if (!Number.isInteger(actual) || actual < 0 || actual > reservation.amount) return "RECONCILIATION_REQUIRED";
  const releaseAmount = reservation.amount - actual;
  await changeWallet(ctx, member, releaseAmount, -reservation.amount);
  if (releaseAmount > 0) await appendLedger(ctx, { studioExternalId: member.studio.externalId, studioId: member.studio._id, entryType: "RELEASE", amount: releaseAmount, sourceType: "RESERVATION", sourceId: reservation._id.toString(), idempotencyKey: `finalize-release:${reservation._id}`, reservationId: reservation._id });
  await appendLedger(ctx, { studioExternalId: member.studio.externalId, studioId: member.studio._id, entryType: "COMMIT", amount: 0, sourceType: "RESERVATION", sourceId: reservation._id.toString(), idempotencyKey: `finalize-commit:${reservation._id}`, reservationId: reservation._id, metadata: { actualAmount: actual } });
  return "COMMITTED";
}

async function releaseInTransaction(ctx: MutationCtx, reservationId: Id<"reservations">) {
  const { reservation, member } = await canonicalReservation(ctx, reservationId);
  const state = reservationState(await ledgerForReservation(ctx, reservation));
  if (state !== "RESERVED") return state;
  await changeWallet(ctx, member, reservation.amount, -reservation.amount);
  await appendLedger(ctx, { studioExternalId: member.studio.externalId, studioId: member.studio._id, entryType: "RELEASE", amount: reservation.amount, sourceType: "RESERVATION", sourceId: reservation._id.toString(), idempotencyKey: `finalize-release:${reservation._id}`, reservationId: reservation._id });
  return "RELEASED";
}

export const expireReservation = mutation({
  args: { reservationId: v.id("reservations") },
  handler: async (ctx, args) => {
    const { reservation } = await canonicalReservation(ctx, args.reservationId);
    if (reservation.expiresAt > now()) throw new Error("Reservation has not expired.");
    return await releaseInTransaction(ctx, reservation._id).then((status) => status === "RELEASED" ? "EXPIRED" : status);
  },
});

export const expireReservations = mutation({
  args: { studioExternalId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const member = await getStudioForMember(ctx, args.studioExternalId);
    const rows = await ctx.db.query("reservations").withIndex("by_studio", (q) => q.eq("studioExternalId", member.studio.externalId)).collect();
    const expired = rows.filter((reservation) => reservation.expiresAt <= now()).slice(0, Math.min(Math.max(args.limit ?? 100, 1), 500));
    const results = [];
    for (const reservation of expired) results.push(await releaseInTransaction(ctx, reservation._id));
    return { expired: results.length, results };
  },
});

export const reconcileReservation = mutation({
  args: { reservationId: v.id("reservations"), adjustmentCredits: v.number(), reason: v.string(), idempotencyKey: v.string() },
  handler: async (ctx, args) => {
    const { reservation, member } = await canonicalReservation(ctx, args.reservationId);
    if (member.role !== "owner" && member.role !== "admin") throw new Error("Administrator access is required.");
    const idempotencyKey = requireKey(args.idempotencyKey);
    const existing = await ctx.db.query("ledger").withIndex("by_idempotency", (q) => q.eq("idempotencyKey", `reconcile:${idempotencyKey}`)).unique();
    if (existing) return existing;
    await changeWallet(ctx, member, -args.adjustmentCredits, 0);
    return await appendLedger(ctx, { studioExternalId: member.studio.externalId, studioId: member.studio._id, entryType: "RECONCILIATION", amount: -args.adjustmentCredits, sourceType: "RESERVATION", sourceId: reservation._id.toString(), idempotencyKey: `reconcile:${idempotencyKey}`, reservationId: reservation._id, metadata: { reason: args.reason } });
  },
});

export const getReservation = query({
  args: { reservationId: v.id("reservations") },
  handler: async (ctx, args) => {
    const { reservation } = await canonicalReservation(ctx, args.reservationId);
    return { reservation, status: reservationState(await ledgerForReservation(ctx, reservation)), ledger: await ledgerForReservation(ctx, reservation) };
  },
});

export const getReservationForJob = query({
  args: { generationJobId: v.id("generationJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.generationJobId);
    if (!job) throw new Error("Generation job not found.");
    await requireMember(ctx, job.studioExternalId);
    const reservations = await ctx.db.query("reservations").withIndex("by_generation_job", (q) => q.eq("generationJobId", args.generationJobId)).collect();
    const reservation = reservations.sort((left, right) => right.createdAt - left.createdAt)[0];
    return reservation ? { ...reservation, status: reservationState(await ledgerForReservation(ctx, reservation)) } : null;
  },
});

export const listReservations = query({
  args: { studioExternalId: v.string() },
  handler: async (ctx, args) => {
    const member = await getStudioForMember(ctx, args.studioExternalId);
    const rows = await ctx.db.query("reservations").withIndex("by_studio", (q) => q.eq("studioExternalId", member.studio.externalId)).order("desc").collect();
    return await Promise.all(rows.map(async (reservation) => ({ reservation, status: reservationState(await ledgerForReservation(ctx, reservation)) })));
  },
});

export const getLedger = query({
  args: { studioExternalId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const member = await getStudioForMember(ctx, args.studioExternalId);
    return await ctx.db.query("ledger").withIndex("by_studio", (q) => q.eq("studioExternalId", member.studio.externalId)).order("desc").take(Math.min(Math.max(args.limit ?? 100, 1), 500));
  },
});

export const createPurchase = mutation({
  args: { studioExternalId: v.string(), provider: v.string(), providerCheckoutId: v.optional(v.string()), amount: v.number(), currency: v.string(), credits: v.number(), reference: v.string(), idempotencyKey: v.optional(v.string()), metadata: v.optional(v.any()) },
  handler: async (ctx, args) => {
    const member = await getStudioForMember(ctx, args.studioExternalId);
    if (args.amount < 0 || !Number.isInteger(args.credits) || args.credits <= 0) throw new Error("Invalid purchase amount or credits.");
    const idempotencyKey = args.idempotencyKey?.trim();
    const existingByKey = idempotencyKey ? await ctx.db.query("purchases").withIndex("by_idempotency", (q) => q.eq("idempotencyKey", idempotencyKey)).unique() : null;
    const existing = existingByKey ?? await ctx.db.query("purchases").withIndex("by_reference", (q) => q.eq("reference", args.reference)).unique();
    if (existing) {
      if (existing.studioExternalId !== member.studio.externalId || existing.credits !== args.credits) throw new Error("Purchase reference is already in use.");
      return existing;
    }
    return await ctx.db.insert("purchases", { studioExternalId: member.studio.externalId, studioId: member.studio._id, provider: args.provider, providerCheckoutId: args.providerCheckoutId, amount: args.amount, currency: args.currency, credits: args.credits, reference: args.reference, status: "PENDING", idempotencyKey, metadata: args.metadata ?? {}, createdAt: now() });
  },
});

export const applyPurchase = mutation({
  args: { purchaseId: v.id("purchases"), providerPaymentId: v.optional(v.string()), idempotencyKey: v.string() },
  handler: async (ctx, args) => {
    const purchase = await ctx.db.get(args.purchaseId);
    if (!purchase) throw new Error("Purchase not found.");
    const member = await getStudioForMember(ctx, purchase.studioExternalId);
    const idempotencyKey = requireKey(args.idempotencyKey);
    const existing = await ctx.db.query("ledger").withIndex("by_idempotency", (q) => q.eq("idempotencyKey", `purchase:${idempotencyKey}`)).unique();
    if (existing) return { purchase, ledger: existing, duplicate: true };
    if (purchase.status === "COMPLETED") return { purchase, ledger: null, duplicate: true };
    await changeWallet(ctx, member, purchase.credits, 0);
    const ledger = await appendLedger(ctx, { studioExternalId: member.studio.externalId, studioId: member.studio._id, entryType: "PURCHASE", amount: purchase.credits, sourceType: "PURCHASE", sourceId: purchase._id.toString(), idempotencyKey: `purchase:${idempotencyKey}`, purchaseId: purchase._id, metadata: { providerPaymentId: args.providerPaymentId } });
    await ctx.db.patch(purchase._id, { status: "COMPLETED", providerPaymentId: args.providerPaymentId, completedAt: now() });
    return { purchase: await ctx.db.get(purchase._id), ledger, duplicate: false };
  },
});
