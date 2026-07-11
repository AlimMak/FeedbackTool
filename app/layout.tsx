import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SAAS Shenanigans — Multi-tenant scaffold",
  description:
    "Shared-database, RLS-isolated multi-tenant B2B SaaS foundation (Next.js + Prisma + Postgres).",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
