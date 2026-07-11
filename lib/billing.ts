import "server-only";

import type Stripe from "stripe";
import type { Plan } from "@prisma/client";

import { adminPrisma } from "@/lib/prisma";
import { getStripe, requireProPriceId } from "@/lib/stripe";

/**
 * Billing state synchronisation.
 *
 * Stripe is the source of truth for *payment* state; the `organizations` row is
 * the app's cached projection of it (`plan`, `subscriptionStatus`,
 * `stripeSubscriptionId`). These helpers translate a Stripe Subscription into
 * that projection and write it via the owner client (webhooks are a trusted,
 * cross-tenant system path that bypasses RLS by design).
 *
 * Writes are **idempotent**: each derives the org's full desired state from the
 * subscription object, so replaying the same webhook event (or receiving events
 * out of order for the same subscription) converges to the same row.
 */

/**
 * Which Stripe subscription statuses grant PRO entitlement.
 *
 * `active`/`trialing` are clearly entitled. `past_due` keeps access during the
 * dunning grace period (a common, customer-friendly choice). Everything else
 * (`canceled`, `unpaid`, `incomplete`, `incomplete_expired`, `paused`) drops the
 * org back to FREE.
 */
const PRO_STATUSES: ReadonlySet<Stripe.Subscription.Status> = new Set([
  "active",
  "trialing",
  "past_due",
]);

export function planForSubscription(sub: Stripe.Subscription): Plan {
  return PRO_STATUSES.has(sub.status) ? "PRO" : "FREE";
}

function customerIdOf(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer,
): string {
  return typeof customer === "string" ? customer : customer.id;
}

/**
 * Find the Organization a subscription belongs to: prefer the `organizationId`
 * we stamp into subscription metadata at checkout, then fall back to matching
 * the Stripe customer id we stored on first checkout.
 */
export async function resolveOrgIdForSubscription(
  sub: Stripe.Subscription,
): Promise<string | null> {
  const fromMeta = sub.metadata?.organizationId;
  if (fromMeta) return fromMeta;

  const org = await adminPrisma.organization.findFirst({
    where: { stripeCustomerId: customerIdOf(sub.customer) },
    select: { id: true },
  });
  return org?.id ?? null;
}

/**
 * Project a Stripe Subscription onto the org row. Safe to call repeatedly.
 */
export async function syncOrgFromSubscription(
  orgId: string,
  sub: Stripe.Subscription,
): Promise<void> {
  const plan = planForSubscription(sub);
  const grantsPro = plan === "PRO";

  await adminPrisma.organization.update({
    where: { id: orgId },
    data: {
      plan,
      subscriptionStatus: sub.status,
      stripeCustomerId: customerIdOf(sub.customer),
      // Track the subscription id only while it entitles the org; clear it on
      // downgrade so a fresh checkout isn't confused by a stale id.
      stripeSubscriptionId: grantsPro ? sub.id : null,
    },
  });
}

export type ProPriceInfo = {
  /** Amount in the currency's major unit (e.g. dollars), already divided. */
  amount: number;
  /** ISO currency code, upper-cased (e.g. "USD"). */
  currency: string;
  /** Billing interval, e.g. "month". */
  interval: string;
  /** Preformatted label, e.g. "$15/mo". */
  label: string;
};

/**
 * Fetch the PRO price from Stripe so the UI can display the real amount rather
 * than a hardcoded value. Returns null if the price can't be read.
 */
export async function getProPriceInfo(): Promise<ProPriceInfo | null> {
  const stripe = getStripe();
  const price = await stripe.prices.retrieve(requireProPriceId());
  if (price.unit_amount == null || !price.recurring) return null;

  const amount = price.unit_amount / 100;
  const currency = price.currency.toUpperCase();
  const interval = price.recurring.interval;
  const intervalShort = interval === "month" ? "mo" : interval === "year" ? "yr" : interval;
  const symbol = currency === "USD" ? "$" : "";
  const amountLabel = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  const label = symbol
    ? `${symbol}${amountLabel}/${intervalShort}`
    : `${amountLabel} ${currency}/${intervalShort}`;

  return { amount, currency, interval, label };
}
