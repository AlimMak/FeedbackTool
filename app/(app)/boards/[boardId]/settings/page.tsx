import Link from "next/link";
import { notFound } from "next/navigation";

import { EmbedSnippet } from "@/app/ui/embed-snippet";
import { PublicToggle } from "@/app/ui/public-toggle";
import { requireActiveOrg, withCurrentTenant } from "@/lib/dal";

export const dynamic = "force-dynamic";

export default async function BoardSettingsPage({
  params,
}: {
  params: Promise<{ boardId: string }>;
}) {
  const { boardId } = await params;
  const { activeOrgId, role, orgs } = await requireActiveOrg();
  if (!activeOrgId) notFound();
  const activeOrg = orgs.find((o) => o.id === activeOrgId)!;

  const board = await withCurrentTenant((tx) =>
    tx.board.findUnique({
      where: { id: boardId },
      select: { id: true, name: true, slug: true, isPublic: true },
    }),
  );
  if (!board) notFound();

  const isOwner = role === "OWNER";
  const base = process.env.APP_URL ?? "http://localhost:3000";
  const url = `${base}/b/${activeOrg.slug}/${board.slug}`;
  const iframe = `<iframe src="${url}" width="100%" height="600" style="border:0" title="${board.name} feedback"></iframe>`;

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <Link
        href={`/boards/${boardId}`}
        className="text-xs text-muted hover:text-foreground"
      >
        ← Back to board
      </Link>
      <h1 className="mt-3 text-lg font-medium">{board.name} · settings</h1>

      <section className="mt-6 rounded-card border-[0.5px] border-border bg-surface p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-medium">Public board</h2>
            <p className="mt-0.5 text-xs text-muted">
              When on, anyone can view, upvote, and suggest at the public URL —
              no account needed. Private boards 404 there.
            </p>
          </div>
          {isOwner ? (
            <PublicToggle boardId={board.id} initial={board.isPublic} />
          ) : (
            <span className="text-xs text-muted">
              {board.isPublic ? "Public" : "Private"}
            </span>
          )}
        </div>
      </section>

      <section className="mt-4 rounded-card border-[0.5px] border-border bg-surface p-5">
        <h2 className="text-sm font-medium">Embed &amp; share</h2>
        {board.isPublic ? (
          <>
            <p className="mt-0.5 text-xs text-muted">
              Drop this on your own site, or share the link with customers.
            </p>
            <div className="mt-3">
              <EmbedSnippet url={url} iframe={iframe} />
            </div>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-block text-xs font-medium text-accent hover:underline"
            >
              Open public board ↗
            </a>
          </>
        ) : (
          <p className="mt-2 text-xs text-muted">
            Make this board public to get an embed snippet and a shareable link.
          </p>
        )}
      </section>

      {!isOwner && (
        <p className="mt-4 text-xs text-muted">
          Only organization owners can change visibility.
        </p>
      )}
    </div>
  );
}
