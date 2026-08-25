import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { now, requireStudio } from "./_shared";

export const getBalance = query({
  args: { studioExternalId: v.string() },
  handler: async (ctx, args) => (await requireStudio(ctx, args.studioExternalId)).credits,
});

export const reserve = mutation({
  args: { studioExternalId: v.string(), amount: v.number(), idempotencyKey: v.string(), generationJobId: v.optional(v.id("generationJobs")) },
  handler: async (ctx, args) => {
    if (!Number.isInteger(args.amount) || args.amount <= 0) throw new Error("Credit amount must be positive");
    const studio = await requireStudio(ctx, args.studioExternalId);
    const existing = await ctx.db.query("creditReservations").withIndex("by_idempotency", (q) => q.eq("idempotencyKey", args.idempotencyKey)).unique();
    if (existing) return { reservationId: existing._id, status: existing.status };
    if (studio.credits < args.amount) throw new Error("Insufficient credits");
    const reservationId = await ctx.db.insert("creditReservations", { studioExternalId: args.studioExternalId, generationJobId: args.generationJobId, amount: args.amount, idempotencyKey: args.idempotencyKey, status: "RESERVED", expiresAt: now() + 30 * 60 * 1000, createdAt: now() });
    await ctx.db.patch(studio._id, { credits: studio.credits - args.amount, updatedAt: now() });
    await ctx.db.insert("creditTransactions", { studioExternalId: args.studioExternalId, delta: -args.amount, transactionType: "RESERVATION", source: "GENERATION", referenceId: reservationId.toString(), metadata: {}, createdAt: now() });
    return { reservationId, status: "RESERVED" };
  },
});

export const finalize = mutation({
  args: { reservationId: v.id("creditReservations"), outcome: v.union(v.literal("COMMIT"), v.literal("RELEASE")) },
  handler: async (ctx, args) => {
    const reservation = await ctx.db.get(args.reservationId);
    if (!reservation) throw new Error("Reservation not found");
    const studio = await requireStudio(ctx, reservation.studioExternalId);
    if (reservation.status !== "RESERVED") return reservation.status;
    if (args.outcome === "RELEASE") {
      await ctx.db.patch(studio._id, { credits: studio.credits + reservation.amount, updatedAt: now() });
      await ctx.db.insert("creditTransactions", { studioExternalId: reservation.studioExternalId, delta: reservation.amount, transactionType: "RELEASE", source: "GENERATION", referenceId: reservation._id.toString(), metadata: {}, createdAt: now() });
    }
    await ctx.db.patch(reservation._id, args.outcome === "COMMIT" ? { status: "COMMITTED", committedAt: now() } : { status: "RELEASED", releasedAt: now() });
    return args.outcome === "COMMIT" ? "COMMITTED" : "RELEASED";
  },
});

export const getReservationForJob = query({
  args: { generationJobId: v.id("generationJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.generationJobId);
    if (!job) throw new Error("Generation job not found");
    await requireStudio(ctx, job.studioExternalId);
    const reservations = await ctx.db.query("creditReservations")
      .withIndex("by_generation_job", (q) => q.eq("generationJobId", args.generationJobId))
      .collect();
    return reservations.sort((left, right) => right.createdAt - left.createdAt)[0] ?? null;
  },
});
