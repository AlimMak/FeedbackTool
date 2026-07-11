"use server";

import { redirect } from "next/navigation";

import { requireActiveOrg } from "@/lib/dal";
import { adminPrisma } from "@/lib/prisma";
import { getStripe, requireProPriceId, APP_URL } from "@/lib/stripe";

/**
 * Billing is per-organization and owner-only. Both actions require the caller to
 * be an OWNER of the active org; the /billing page also hides the buttons from
 * non-owners, but these server-side checks are the real boundary.
 */
async function requireOwnerContext(): Promise<{
  orgId: string;
  userId: string;
}> {
  const { activeOrgId, role, userId } = await requireActiveOrg();
  if (!activeOrgId) redirect("/");
  if (role !== "OWNER") {
    throw new Error("Only organization owners can manage billing.");
  }
  return { orgId: activeOrgId, userId };
}

/**
 * Start a Stripe Checkout session to subscribe the org to PRO, then redirect to
 * Stripe's hosted page. The Organization is the Stripe customer; the customer is
 * created (and its id stored) on first checkout and reused afterwards.
 */
export async function startCheckout(): Promise<void> {
  const { orgId, userId } = await requireOwnerContext();
  const stripe = getStripe();
  const priceId = requireProPriceId();

  const org = await adminPrisma.organization.findUniqueOrThrow({
    where: { id: orgId },
    select: { id: true, name: true, stripeCustomerId: true },
  });
  const user = await adminPrisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { email: true },
  });

  let customerId = org.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      name: org.name,
      email: user.email,
      metadata: { organizationId: org.id },
    });
    customerId = customer.id;
    await adminPrisma.organization.update({
      where: { id: org.id },
      data: { stripeCustomerId: customerId },
    });
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: org.id,
    // Stamp the org id so the webhook can resolve it directly.
    subscription_data: { metadata: { organizationId: org.id } },
    success_url: `${APP_URL}/billing?checkout=success`,
    cancel_url: `${APP_URL}/billing?checkout=cancelled`,
  });

  if (!session.url) {
    throw new Error("Stripe did not return a Checkout URL.");
  }
  redirect(session.url);
}

/**
 * Open the Stripe Customer Portal so the org can manage or cancel its
 * subscription and see invoices.
 */
export async function openBillingPortal(): Promise<void> {
  const { orgId } = await requireOwnerContext();
  const stripe = getStripe();

  const org = await adminPrisma.organization.findUniqueOrThrow({
    where: { id: orgId },
    select: { stripeCustomerId: true },
  });
  if (!org.stripeCustomerId) {
    // No customer yet — nothing to manage; send them back to upgrade.
    redirect("/billing");
  }

  const portal = await stripe.billingPortal.sessions.create({
    customer: org.stripeCustomerId,
    return_url: `${APP_URL}/billing`,
  });
  redirect(portal.url);
}
