"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { NewBoardDialog } from "./new-board-dialog";
import { PlusIcon } from "./icons";

export function BoardList({
  boards,
}: {
  boards: ReadonlyArray<{ id: string; name: string }>;
}) {
  const pathname = usePathname();
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div>
      <p className="px-2 pb-1 pt-2 text-xs font-medium text-muted">Boards</p>
      <ul className="space-y-0.5">
        {boards.map((board) => {
          const active = pathname === `/boards/${board.id}`;
          return (
            <li key={board.id}>
              <Link
                href={`/boards/${board.id}`}
                aria-current={active ? "page" : undefined}
                className={`block truncate rounded-md px-2 py-1.5 text-sm ${
                  active
                    ? "bg-accent-subtle font-medium text-accent"
                    : "text-foreground hover:bg-surface-2"
                }`}
              >
                {board.name}
              </Link>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted hover:bg-surface-2 hover:text-foreground"
          >
            <PlusIcon className="h-4 w-4" />
            New board
          </button>
        </li>
      </ul>

      {dialogOpen && <NewBoardDialog onClose={() => setDialogOpen(false)} />}
    </div>
  );
}
