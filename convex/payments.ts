import { internalMutation, mutation } from "./_generated/server";
import { v } from "convex/values";
import { now, requireStudio } from "./_shared";

function object(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export const createPurchase = mutation({
  args: { studioExternalId: v.string(), provider: v.string(), providerCheckoutId: v.optional(v.string()), amount: v.number(), currency: v.string(), credits: v.number(), reference: v.string(), metadata: v.any() },
  handler: async (ctx, args) => {
    await requireStudio(ctx, args.studioExternalId);
    return await ctx.db.insert("paymentPurchases", { studioExternalId: args.studioExternalId, provider: args.provider, providerCheckoutId: args.providerCheckoutId, amount: args.amount, currency: args.currency, credits: args.credits, reference: args.reference, status: "PENDING", metadata: args.metadata, createdAt: now() });
  },
});

/**
 * Fulfill a verified Bachs event. This is internal on purpose: the public
 * webhook entry point is the signed paymentWebhook action, which verifies the
 * raw body and timestamp before calling this mutation.
 */
export const processBachsEvent = internalMutation({
  args: {
    eventId: v.string(), eventType: v.string(), payload: v.any(), checkoutId: v.optional(v.string()),
    reference: v.optional(v.string()), chargeId: v.optional(v.string()), amount: v.optional(v.number()), currency: v.optional(v.string()),
    refundId: v.optional(v.string()), refundAmount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const duplicate = await ctx.db.query("paymentEvents").withIndex("by_provider_event", (q) => q.eq("provider", "bachs").eq("providerEventId", args.eventId)).unique();
    if (duplicate) return { duplicate: true, status: "DUPLICATE" };

    const purchase = args.checkoutId
      ? await ctx.db.query("purchases").withIndex("by_checkout", (q) => q.eq("providerCheckoutId", args.checkoutId!)).unique()
      : args.reference
        ? await ctx.db.query("purchases").withIndex("by_reference", (q) => q.eq("reference", args.reference!)).unique()
        : args.chargeId
          ? await ctx.db.query("purchases").withIndex("by_provider_payment", (q) => q.eq("provider", "bachs").eq("providerPaymentId", args.chargeId)).unique()
          : null;
    const studio = purchase ? await ctx.db.query("studios").withIndex("by_external_id", (q) => q.eq("externalId", purchase.studioExternalId)).unique() : null;
    const eventRecordId = await ctx.db.insert("paymentEvents", {
      studioExternalId: purchase?.studioExternalId,
      studioId: studio?._id,
      provider: "bachs",
      providerEventId: args.eventId,
      eventType: args.eventType,
      payload: args.payload,
      purchaseId: purchase?._id,
      receivedAt: now(),
      createdAt: now(),
    });

    if (!purchase || !studio) return { duplicate: false, status: "QUARANTINED", eventId: eventRecordId, reason: "UNKNOWN_PURCHASE" };

    if (args.eventType === "collection.succeeded") {
      if (args.amount === undefined || args.currency === undefined || Math.abs(args.amount - purchase.amount) > 0.01 || args.currency !== purchase.currency) {
        await ctx.db.patch(purchase._id, { status: "QUARANTINED", metadata: { ...object(purchase.metadata), financial: { state: "QUARANTINED", reason: "AMOUNT_OR_CURRENCY_MISMATCH", receivedAmount: args.amount, receivedCurrency: args.currency } } });
        await ctx.db.patch(eventRecordId, { processedAt: now() });
        return { duplicate: false, status: "QUARANTINED", eventId: eventRecordId, purchaseId: purchase._id };
      }
      if (purchase.status === "COMPLETED") return { duplicate: false, status: "COMPLETED", eventId: eventRecordId, purchaseId: purchase._id };
      if (purchase.status !== undefined && purchase.status !== "PENDING") return { duplicate: false, status: purchase.status, eventId: eventRecordId, purchaseId: purchase._id };

      const existingLedger = await ctx.db.query("ledger").withIndex("by_idempotency", (q) => q.eq("idempotencyKey", `purchase:${purchase._id.toString()}`)).unique();
      if (!existingLedger) {
        const wallet = await ctx.db.query("credits").withIndex("by_studio", (q) => q.eq("studioExternalId", studio.externalId)).unique();
        const currentBalance = wallet?.balance ?? Math.max(0, studio.credits);
        const timestamp = now();
        if (wallet) await ctx.db.patch(wallet._id, { balance: currentBalance + purchase.credits, updatedAt: timestamp });
        else await ctx.db.insert("credits", { studioExternalId: studio.externalId, studioId: studio._id, balance: currentBalance + purchase.credits, reserved: 0, currency: "credits", createdAt: timestamp, updatedAt: timestamp });
        await ctx.db.patch(studio._id, { credits: currentBalance + purchase.credits, updatedAt: timestamp });
        await ctx.db.insert("ledger", { studioExternalId: studio.externalId, studioId: studio._id, entryType: "PURCHASE", amount: purchase.credits, sourceType: "PURCHASE", sourceId: purchase._id.toString(), idempotencyKey: `purchase:${purchase._id.toString()}`, purchaseId: purchase._id, metadata: { provider: "bachs", providerPaymentId: args.chargeId, eventId: args.eventId }, createdAt: timestamp });
      }
      await ctx.db.patch(purchase._id, { status: "COMPLETED", providerPaymentId: args.chargeId, completedAt: now(), metadata: { ...object(purchase.metadata), financial: { state: "COMPLETED", providerPaymentId: args.chargeId, eventId: args.eventId } } });
      await ctx.db.patch(eventRecordId, { processedAt: now() });
      return { duplicate: false, status: "COMPLETED", eventId: eventRecordId, purchaseId: purchase._id };
    }

    if (args.eventType === "collection.underpaid" || args.eventType === "collection.failed" || args.eventType === "checkout.expired") {
      await ctx.db.patch(purchase._id, { status: args.eventType === "collection.underpaid" ? "QUARANTINED" : "FAILED", metadata: { ...object(purchase.metadata), financial: { state: args.eventType === "collection.underpaid" ? "QUARANTINED" : "FAILED", eventId: args.eventId } } });
      await ctx.db.patch(eventRecordId, { processedAt: now() });
      return { duplicate: false, status: args.eventType === "collection.underpaid" ? "QUARANTINED" : "FAILED", eventId: eventRecordId, purchaseId: purchase._id };
    }

    if (["refund.created", "refund.pending", "refund.paid", "refund.succeeded", "refund.failed", "refund.reversed"].includes(args.eventType)) {
      const refundCurrency = args.currency ?? purchase.currency;
      if (!args.refundId || args.refundAmount === undefined || args.refundAmount <= 0 || refundCurrency !== purchase.currency) {
        await ctx.db.patch(eventRecordId, { processedAt: now() });
        return { duplicate: false, status: "QUARANTINED", eventId: eventRecordId, purchaseId: purchase._id, reason: "INVALID_REFUND_DETAILS" };
      }

      const existingRefund = await ctx.db.query("refunds").withIndex("by_provider_refund", (q) => q.eq("provider", "bachs").eq("providerRefundId", args.refundId!)).unique();
      const refundId = existingRefund?._id ?? await ctx.db.insert("refunds", {
        studioExternalId: studio.externalId,
        studioId: studio._id,
        purchaseId: purchase._id,
        provider: "bachs",
        providerRefundId: args.refundId,
        amount: args.refundAmount,
        currency: refundCurrency,
        reason: "Bachs refund",
        status: "PENDING",
        idempotencyKey: `refund:${args.refundId}`,
        metadata: { eventId: args.eventId, eventType: args.eventType },
        createdAt: now(),
      });

      if (args.eventType === "refund.failed" || args.eventType === "refund.reversed") {
        await ctx.db.patch(refundId, { status: "FAILED", metadata: { eventId: args.eventId, eventType: args.eventType } });
        await ctx.db.patch(eventRecordId, { processedAt: now() });
        return { duplicate: false, status: "FAILED", eventId: eventRecordId, refundId };
      }
      if (args.eventType === "refund.created" || args.eventType === "refund.pending") {
        await ctx.db.patch(refundId, { status: "PENDING", metadata: { eventId: args.eventId, eventType: args.eventType } });
        await ctx.db.patch(eventRecordId, { processedAt: now() });
        return { duplicate: false, status: "PENDING", eventId: eventRecordId, refundId };
      }

      const refundLedgerKey = `refund:${args.refundId}`;
      const existingRefundLedger = await ctx.db.query("ledger").withIndex("by_idempotency", (q) => q.eq("idempotencyKey", refundLedgerKey)).unique();
      if (existingRefundLedger) {
        await ctx.db.patch(refundId, { status: "COMPLETED", completedAt: now() });
        await ctx.db.patch(eventRecordId, { processedAt: now() });
        return { duplicate: false, status: "COMPLETED", eventId: eventRecordId, refundId };
      }

      const refundCredits = Math.min(purchase.credits, Math.max(1, Math.round(purchase.credits * (args.refundAmount / Math.max(purchase.amount, 0.01)))));
      const wallet = await ctx.db.query("credits").withIndex("by_studio", (q) => q.eq("studioExternalId", studio.externalId)).unique();
      const available = wallet?.balance ?? Math.max(0, studio.credits);
      if (!wallet || available < refundCredits) {
        await ctx.db.patch(refundId, { status: "QUARANTINED", metadata: { eventId: args.eventId, reason: "CREDITS_ALREADY_SPENT", requestedCredits: refundCredits, availableCredits: available } });
        await ctx.db.patch(eventRecordId, { processedAt: now() });
        return { duplicate: false, status: "QUARANTINED", eventId: eventRecordId, refundId, reason: "CREDITS_ALREADY_SPENT" };
      }
      const timestamp = now();
      await ctx.db.patch(wallet._id, { balance: available - refundCredits, updatedAt: timestamp });
      await ctx.db.patch(studio._id, { credits: available - refundCredits, updatedAt: timestamp });
      await ctx.db.insert("ledger", { studioExternalId: studio.externalId, studioId: studio._id, entryType: "REFUND", amount: -refundCredits, sourceType: "REFUND", sourceId: refundId.toString(), idempotencyKey: refundLedgerKey, purchaseId: purchase._id, refundId, metadata: { provider: "bachs", providerRefundId: args.refundId, eventId: args.eventId, amount: args.refundAmount, currency: refundCurrency }, createdAt: timestamp });
      await ctx.db.patch(refundId, { status: "COMPLETED", completedAt: timestamp, metadata: { eventId: args.eventId, refundedCredits: refundCredits } });
      await ctx.db.patch(eventRecordId, { processedAt: timestamp });
      return { duplicate: false, status: "COMPLETED", eventId: eventRecordId, refundId, refundedCredits: refundCredits };
    }

    await ctx.db.patch(eventRecordId, { processedAt: now() });
    return { duplicate: false, status: "RECORDED", eventId: eventRecordId, purchaseId: purchase._id };
  },
});
