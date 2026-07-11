import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";

import { getStripe, STRIPE_WEBHOOK_SECRET } from "@/lib/stripe";
import {
  resolveOrgIdForSubscription,
  syncOrgFromSubscription,
} from "@/lib/billing";

/**
 * Stripe webhook endpoint.
 *
 * The signature is verified against the raw request body using
 * STRIPE_WEBHOOK_SECRET — an unsigned or tampered request is rejected with 400.
 * Handlers are idempotent (they write derived state), so Stripe's automatic
 * retries and any duplicate deliveries are safe.
 *
 * This route lives under /api, which the proxy's matcher excludes, so Stripe can
 * reach it without an app session.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!STRIPE_WEBHOOK_SECRET) {
    return new NextResponse("Stripe webhook secret not configured", {
      status: 500,
    });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return new NextResponse("Missing stripe-signature header", { status: 400 });
  }

  const stripe = getStripe();
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return new NextResponse(`Webhook signature verification failed: ${message}`, {
      status: 400,
    });
  }

  try {
    await handleEvent(stripe, event);
  } catch (err) {
    // Return 500 so Stripe retries; log for debugging.
    console.error(`[stripe webhook] failed to handle ${event.type}:`, err);
    return new NextResponse("Webhook handler error", { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function handleEvent(
  stripe: Stripe,
  event: Stripe.Event,
): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const orgId =
        session.client_reference_id ??
        session.metadata?.organizationId ??
        null;
      const subscriptionId =
        typeof session.subscription === "string"
          ? session.subscription
          : (session.subscription?.id ?? null);
      if (!orgId || !subscriptionId) return;

      // Fetch the full subscription to derive the org's plan/status.
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      await syncOrgFromSubscription(orgId, subscription);
      return;
    }

    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object;
      const orgId = await resolveOrgIdForSubscription(subscription);
      if (!orgId) return;
      await syncOrgFromSubscription(orgId, subscription);
      return;
    }

    default:
      // Ignore everything else.
      return;
  }
}
