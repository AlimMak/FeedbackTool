"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth, unstable_update } from "@/auth";
import { getMyOrganizations } from "@/lib/dal";

/**
 * Switch the caller's active organization.
 *
 * Membership is re-verified server-side (a signed token cannot be trusted to
 * only contain orgs the user may act as), then the active org is written into
 * the JWT via `unstable_update`. This flows through the `jwt` callback
 * (`trigger === "update"`) and, on the next request, into the RLS
 * `app.current_tenant` variable via the Data Access Layer.
 */
export async function switchOrganization(formData: FormData): Promise<void> {
  const orgId = formData.get("orgId");
  if (typeof orgId !== "string") return;

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    redirect("/login");
  }

  const orgs = await getMyOrganizations(userId);
  if (!orgs.some((o) => o.id === orgId)) {
    throw new Error("You are not a member of that organization.");
  }

  await unstable_update({ activeOrgId: orgId });

  // Re-render the dashboard with the new tenant context.
  revalidatePath("/", "layout");
}
