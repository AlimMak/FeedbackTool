import "server-only";

import Stripe from "stripe";

/**
 * Stripe configuration and lazily-constructed client.
 *
 * Everything here runs server-side only. Keys are read from the environment
 * (see .env.example) and never shipped to the client. Use TEST-mode keys
 * (`sk_test_…`) throughout local development.
 *
 * The client is created lazily so the app still boots (and pages that don't need
 * billing still render) when Stripe isn't configured yet — callers that actually
 * need Stripe get a clear error from {@link getStripe}.
 */

export const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
/** Price id (`price_…`) of the recurring PRO plan. From `npm run stripe:setup`. */
export const STRIPE_PRICE_PRO = process.env.STRIPE_PRICE_PRO;

/** Absolute base URL used to build Stripe redirect (success/cancel/return) URLs. */
export const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

/** True when both the secret key and the PRO price id are present. */
export const isBillingConfigured = Boolean(STRIPE_SECRET_KEY && STRIPE_PRICE_PRO);

let client: Stripe | null = null;

/**
 * Get the shared Stripe client, throwing a clear, actionable error if the secret
 * key is missing. Call this only from code paths that genuinely need Stripe.
 */
export function getStripe(): Stripe {
  if (!STRIPE_SECRET_KEY) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. Copy .env.example to .env and paste your " +
        "Stripe TEST-mode secret key (sk_test_…).",
    );
  }
  if (!client) {
    // Pin nothing here: the installed SDK targets a known API version. Passing
    // the account default keeps types and runtime in agreement.
    client = new Stripe(STRIPE_SECRET_KEY);
  }
  return client;
}

/** The PRO price id, or throw if not configured. */
export function requireProPriceId(): string {
  if (!STRIPE_PRICE_PRO) {
    throw new Error(
      "STRIPE_PRICE_PRO is not set. Run `npm run stripe:setup` and paste the " +
        "printed PRO price id (price_…) into .env.",
    );
  }
  return STRIPE_PRICE_PRO;
}
