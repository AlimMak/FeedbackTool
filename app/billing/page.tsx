import Link from "next/link";
import type { Metadata } from "next";
import type { Plan } from "@prisma/client";

import { openBillingPortal, startCheckout } from "@/app/actions/billing";
import { PlanBadge } from "@/app/ui/plan-badge";
import { requireActiveOrg, withCurrentTenant } from "@/lib/dal";
import { getProPriceInfo, type ProPriceInfo } from "@/lib/billing";
import { isBillingConfigured } from "@/lib/stripe";
import { PLAN_LIMITS } from "@/lib/plans";

export const metadata: Metadata = { title: "Billing — SAAS Shenanigans" };
export const dynamic = "force-dynamic";

type OrgBilling = {
  plan: Plan;
  subscriptionStatus: string | null;
  hasCustomer: boolean;
};

function LimitsList({ plan }: { plan: Plan }) {
  const l = PLAN_LIMITS[plan];
  const boards = l.maxBoards === null ? "Unlimited boards" : `${l.maxBoards} board${l.maxBoards === 1 ? "" : "s"}`;
  const posts =
    l.maxPostsPerBoard === null
      ? "Unlimited posts per board"
      : `${l.maxPostsPerBoard} posts per board`;
  return (
    <ul className="mt-2 space-y-1 text-sm text-slate-600 dark:text-slate-400">
      <li>• {boards}</li>
      <li>• {posts}</li>
    </ul>
  );
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const { activeOrgId, role, orgs } = await requireActiveOrg();
  const { checkout } = await searchParams;

  if (!activeOrgId) {
    return (
      <main className="mx-auto w-full max-w-2xl px-6 py-12">
        <BackLink />
        <p className="mt-8 text-sm text-slate-500">No active organization.</p>
      </main>
    );
  }

  const activeOrg = orgs.find((o) => o.id === activeOrgId)!;

  // RLS-scoped read of the active org's billing state.
  const billing = await withCurrentTenant<OrgBilling>(async (tx) => {
    const org = await tx.organization.findFirstOrThrow({
      select: { plan: true, subscriptionStatus: true, stripeCustomerId: true },
    });
    return {
      plan: org.plan,
      subscriptionStatus: org.subscriptionStatus,
      hasCustomer: org.stripeCustomerId !== null,
    };
  });

  const isOwner = role === "OWNER";

  // Read the PRO price from Stripe (never hardcoded in the UI). If Stripe isn't
  // configured or the price can't be read, we degrade to a setup notice.
  let priceInfo: ProPriceInfo | null = null;
  let priceError = false;
  if (isBillingConfigured) {
    try {
      priceInfo = await getProPriceInfo();
    } catch {
      priceError = true;
    }
  }
  const configured = isBillingConfigured && priceInfo !== null && !priceError;

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-12">
      <BackLink />

      <header className="mt-6 mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Billing</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Plan &amp; subscription for <strong>{activeOrg.name}</strong>. Billing is
          per-organization — the org is the customer.
        </p>
      </header>

      {checkout === "success" && (
        <Banner tone="ok">
          Payment received. Your plan updates automatically once Stripe confirms
          the subscription (via webhook) — refresh in a moment if it still shows
          FREE.
        </Banner>
      )}
      {checkout === "cancelled" && (
        <Banner tone="muted">Checkout cancelled — no changes were made.</Banner>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">Current plan</span>
            <PlanBadge plan={billing.plan} />
          </div>
          {billing.subscriptionStatus && (
            <span className="font-mono text-xs text-slate-400">
              {billing.subscriptionStatus}
            </span>
          )}
        </div>
        <LimitsList plan={billing.plan} />
      </section>

      {!isOwner && (
        <Banner tone="muted">
          Only organization <strong>owners</strong> can change billing. Ask an
          owner of {activeOrg.name} to upgrade or manage the subscription.
        </Banner>
      )}

      {isOwner && !configured && (
        <Banner tone="warn">
          Billing isn&apos;t configured yet. Add your Stripe TEST keys and PRO
          price id to <code className="font-mono">.env</code> (see{" "}
          <code className="font-mono">.env.example</code> and run{" "}
          <code className="font-mono">npm run stripe:setup</code>).
        </Banner>
      )}

      {isOwner && configured && priceInfo && (
        <section className="mt-6 grid gap-4 sm:grid-cols-2">
          {billing.plan === "FREE" && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-5 dark:border-blue-500/30 dark:bg-blue-500/10">
              <h2 className="text-sm font-semibold">Upgrade to Pro</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                Unlimited boards and posts for{" "}
                <strong>{priceInfo.label}</strong>.
              </p>
              <form action={startCheckout} className="mt-4">
                <button
                  type="submit"
                  className="w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-500"
                >
                  Upgrade to Pro — {priceInfo.label}
                </button>
              </form>
            </div>
          )}

          {billing.hasCustomer && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="text-sm font-semibold">Manage subscription</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                Update payment method, view invoices, or cancel in the Stripe
                Customer Portal.
              </p>
              <form action={openBillingPortal} className="mt-4">
                <button
                  type="submit"
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Manage billing
                </button>
              </form>
            </div>
          )}
        </section>
      )}
    </main>
  );
}

function BackLink() {
  return (
    <Link
      href="/"
      className="text-xs font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
    >
      ← Back to dashboard
    </Link>
  );
}

function Banner({
  tone,
  children,
}: {
  tone: "ok" | "warn" | "muted";
  children: React.ReactNode;
}) {
  const styles = {
    ok: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200",
    warn: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200",
    muted:
      "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-300",
  }[tone];
  return (
    <div className={`mt-6 rounded-lg border p-4 text-sm ${styles}`}>{children}</div>
  );
}
