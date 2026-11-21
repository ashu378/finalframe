"use node";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { verifyBachsSignature } from "../src/lib/payments/bachs";

export const receive = action({
  args: { rawBody: v.string(), timestamp: v.string(), signature: v.string() }, returns: v.any(),
  handler: async (ctx, args): Promise<any> => {
    if (Buffer.byteLength(args.rawBody, 'utf8') > 131072) throw new Error('Webhook body too large.');
    if (!verifyBachsSignature(args.rawBody, args.timestamp, args.signature, process.env.BACHS_WEBHOOK_SECRET)) throw new Error('Invalid Bachs webhook signature.');
    const event = JSON.parse(args.rawBody);
    if (!event || typeof event.id !== 'string' || !event.id || event.id.length > 200 || typeof event.type !== 'string' || event.type.length > 100 || !event.data || typeof event.data !== 'object' || Array.isArray(event.data)) throw new Error('Invalid webhook envelope.');
    if (process.env.BACHS_ENVIRONMENT !== 'sandbox') throw new Error('Live payments have not been activated.');
    return ctx.runMutation(internal.sandboxPaymentEvents.applyEvent, { event });
  },
});
