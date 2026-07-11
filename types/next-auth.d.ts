// Module augmentation: teach next-auth about the extra fields this app puts on
// the session and JWT.
//
//   * `session.user.id`   — the global User id (identity).
//   * `session.activeOrgId` — the Organization the user is currently acting as.
//     This is the value fed into the RLS `app.current_tenant` session variable
//     (see lib/dal.ts → withCurrentTenant). `null` means "no active org yet".
//
// The JWT mirrors these because the session is stateless (JWT strategy, required
// by the Credentials provider).

import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    activeOrgId: string | null;
    user: {
      id: string;
    } & DefaultSession["user"];
  }

  // The object returned by the Credentials `authorize()` callback and passed to
  // the `jwt` callback on sign-in.
  interface User {
    activeOrgId: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    activeOrgId?: string | null;
  }
}
