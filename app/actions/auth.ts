"use server";

import { AuthError } from "next-auth";

import { signIn, signOut } from "@/auth";

/**
 * Sign-in server action for the login form. Shaped for `useActionState`: it
 * returns an error string on failure and never returns on success (Auth.js
 * throws a redirect, which must be re-thrown to run).
 */
export async function authenticate(
  _prevState: string | undefined,
  formData: FormData,
): Promise<string | undefined> {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/",
    });
  } catch (error) {
    // Bad credentials surface as an AuthError; anything else (notably the
    // NEXT_REDIRECT thrown on success) must propagate.
    if (error instanceof AuthError) {
      return "Invalid email or password.";
    }
    throw error;
  }
  return undefined;
}

export async function logout(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
