import type { Metadata } from "next";

import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in — SAAS Shenanigans",
};

// The session is read from a cookie on every request.
export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-12">
      <header className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-blue-600 dark:text-blue-400">
          Multi-tenant scaffold
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Sign in</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Use a seeded account (e.g.{" "}
          <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs dark:bg-slate-800">
            alice@acme.test
          </code>
          ). All seed passwords are{" "}
          <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs dark:bg-slate-800">
            password123
          </code>
          .
        </p>
      </header>

      <LoginForm />
    </main>
  );
}
