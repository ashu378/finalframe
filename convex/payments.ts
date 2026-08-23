import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { now, requireStudio } from "./_shared";

export const createPurchase = mutation({
  args: { ownerExternalId: v.string(), studioExternalId: v.string(), provider: v.string(), providerCheckoutId: v.optional(v.string()), amount: v.number(), currency: v.string(), credits: v.number(), reference: v.string(), metadata: v.any() },
  handler: async (ctx, args) => {
    await requireStudio(ctx, args.studioExternalId, args.ownerExternalId);
    return await ctx.db.insert("paymentPurchases", { studioExternalId: args.studioExternalId, provider: args.provider, providerCheckoutId: args.providerCheckoutId, amount: args.amount, currency: args.currency, credits: args.credits, reference: args.reference, status: "PENDING", metadata: args.metadata, createdAt: now() });
  },
});

export const recordWebhook = mutation({
  args: { provider: v.string(), providerEventId: v.string(), eventType: v.string(), payload: v.any(), reference: v.optional(v.string()), providerCheckoutId: v.optional(v.string()), providerChargeId: v.optional(v.string()), amount: v.optional(v.number()), currency: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const duplicate = await ctx.db.query("paymentEvents").withIndex("by_provider_event", (q) => q.eq("provider", args.provider).eq("providerEventId", args.providerEventId)).unique();
    if (duplicate) return { duplicate: true };
    const eventId = await ctx.db.insert("paymentEvents", { provider: args.provider, providerEventId: args.providerEventId, eventType: args.eventType, payload: args.payload, createdAt: now() });
    if (args.eventType !== "collection.succeeded") return { duplicate: false, eventId };
    const purchase = args.providerCheckoutId
      ? await ctx.db.query("paymentPurchases").withIndex("by_checkout", (q) => q.eq("providerCheckoutId", args.providerCheckoutId!)).unique()
      : args.reference
        ? await ctx.db.query("paymentPurchases").withIndex("by_reference", (q) => q.eq("reference", args.reference!)).unique()
        : null;
    if (!purchase || purchase.status !== "PENDING") return { duplicate: false, eventId };
    if (args.amount !== undefined && Math.abs(args.amount - purchase.amount) > 0.01 || args.currency !== undefined && args.currency !== purchase.currency) {
      await ctx.db.patch(purchase._id, { status: "QUARANTINED" });
      return { duplicate: false, eventId, quarantined: true };
    }
    const studio = await ctx.db.query("studios").withIndex("by_external_id", (q) => q.eq("externalId", purchase.studioExternalId)).unique();
    if (!studio) throw new Error("Studio not found");
    await ctx.db.patch(studio._id, { credits: studio.credits + purchase.credits, updatedAt: now() });
    await ctx.db.insert("creditTransactions", { studioExternalId: purchase.studioExternalId, delta: purchase.credits, transactionType: "PURCHASE", source: "BACHS", referenceId: purchase._id.toString(), metadata: { providerChargeId: args.providerChargeId, eventId }, createdAt: now() });
    await ctx.db.patch(purchase._id, { status: "COMPLETED", completedAt: now() });
    await ctx.db.patch(eventId, { processedAt: now() });
    return { duplicate: false, eventId, purchaseId: purchase._id };
  },
});
