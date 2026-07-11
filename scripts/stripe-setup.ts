/**
 * One-time Stripe TEST-mode setup: creates the FREE and PRO products and the
 * recurring PRO price in your Stripe account, then prints the PRO price id to
 * paste into `.env` as STRIPE_PRICE_PRO.
 *
 * Run:  npm run stripe:setup   (loads .env via --env-file)
 *
 * Idempotent-ish: it looks up existing products by a metadata tag before
 * creating, so re-running won't pile up duplicates.
 */
import Stripe from "stripe";

// Change this if you want a different PRO price. The UI never hardcodes the
// amount — it reads it back from Stripe — so this is the single source of truth.
const PRO_MONTHLY_AMOUNT_CENTS = 1500; // $15.00 / month
const CURRENCY = "usd";

async function findProductByTag(
  stripe: Stripe,
  tag: string,
): Promise<Stripe.Product | null> {
  // Search is available in test mode; fall back to listing if not enabled.
  try {
    const res = await stripe.products.search({
      query: `metadata['app_plan']:'${tag}'`,
      limit: 1,
    });
    return res.data[0] ?? null;
  } catch {
    const list = await stripe.products.list({ limit: 100, active: true });
    return list.data.find((p) => p.metadata.app_plan === tag) ?? null;
  }
}

async function main(): Promise<void> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    console.error(
      "STRIPE_SECRET_KEY is not set. Paste your Stripe TEST secret key into " +
        ".env (see .env.example), then re-run `npm run stripe:setup`.",
    );
    process.exit(1);
  }
  if (!key.startsWith("sk_test_")) {
    console.error(
      "Refusing to run: STRIPE_SECRET_KEY is not a TEST-mode key (sk_test_…). " +
        "This project is test-mode only.",
    );
    process.exit(1);
  }

  const stripe = new Stripe(key);

  // FREE — an informational product so the plan exists in Stripe. No price is
  // needed (FREE never goes through Checkout).
  let free = await findProductByTag(stripe, "FREE");
  if (!free) {
    free = await stripe.products.create({
      name: "SAAS Shenanigans — FREE",
      metadata: { app_plan: "FREE" },
    });
    console.log(`Created FREE product: ${free.id}`);
  } else {
    console.log(`FREE product already exists: ${free.id}`);
  }

  // PRO — product + recurring monthly price.
  let pro = await findProductByTag(stripe, "PRO");
  if (!pro) {
    pro = await stripe.products.create({
      name: "SAAS Shenanigans — PRO",
      metadata: { app_plan: "PRO" },
    });
    console.log(`Created PRO product: ${pro.id}`);
  } else {
    console.log(`PRO product already exists: ${pro.id}`);
  }

  // Reuse a matching active recurring price if one already exists.
  const prices = await stripe.prices.list({ product: pro.id, active: true, limit: 100 });
  let proPrice = prices.data.find(
    (p) =>
      p.recurring?.interval === "month" &&
      p.unit_amount === PRO_MONTHLY_AMOUNT_CENTS &&
      p.currency === CURRENCY,
  );
  if (!proPrice) {
    proPrice = await stripe.prices.create({
      product: pro.id,
      unit_amount: PRO_MONTHLY_AMOUNT_CENTS,
      currency: CURRENCY,
      recurring: { interval: "month" },
    });
    console.log(`Created PRO price: ${proPrice.id}`);
  } else {
    console.log(`PRO price already exists: ${proPrice.id}`);
  }

  console.log("\n──────────────────────────────────────────────");
  console.log("Paste this into your .env:\n");
  console.log(`STRIPE_PRICE_PRO="${proPrice.id}"`);
  console.log("──────────────────────────────────────────────");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
