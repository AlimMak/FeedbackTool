import "server-only";

import { cookies } from "next/headers";
import { createHmac, randomUUID, timingSafeEqual } from "crypto";

/**
 * Anonymous visitor identity for the public routes, stored in an HMAC-signed,
 * httpOnly cookie. Used to dedupe upvotes (one per post per visitor) without
 * accounts. Signing means a client can't forge or reuse another visitor's id.
 */
const COOKIE = "fb_vid";
const SECRET = process.env.AUTH_SECRET ?? "insecure-dev-secret";

function sign(id: string): string {
  return createHmac("sha256", SECRET).update(id).digest("base64url");
}

function verify(raw: string | undefined): string | null {
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;
  const id = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  const expected = sign(id);
  if (
    sig.length !== expected.length ||
    !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  ) {
    return null;
  }
  return id;
}

/** Read the visitor id if a valid signed cookie is present (never writes). */
export async function readVisitorId(): Promise<string | null> {
  const store = await cookies();
  return verify(store.get(COOKIE)?.value);
}

/**
 * Read the visitor id, minting and setting one if absent. Must be called from a
 * Server Action or Route Handler (it may set a cookie).
 */
export async function getOrCreateVisitorId(): Promise<string> {
  const store = await cookies();
  const existing = verify(store.get(COOKIE)?.value);
  if (existing) return existing;

  const id = randomUUID();
  store.set(COOKIE, `${id}.${sign(id)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return id;
}
