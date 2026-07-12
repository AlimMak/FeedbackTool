"use client";

import { useState } from "react";

/** Copyable embed iframe + direct link for a public board. */
export function EmbedSnippet({ url, iframe }: { url: string; iframe: string }) {
  const [copied, setCopied] = useState<"iframe" | "url" | null>(null);

  async function copy(text: string, key: "iframe" | "url") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    } catch {
      // Clipboard may be unavailable (e.g. non-secure context); the field is
      // selectable as a fallback.
    }
  }

  return (
    <div className="space-y-4">
      <Field
        label="Embed (iframe)"
        value={iframe}
        multiline
        copied={copied === "iframe"}
        onCopy={() => copy(iframe, "iframe")}
      />
      <Field
        label="Direct link"
        value={url}
        copied={copied === "url"}
        onCopy={() => copy(url, "url")}
      />
    </div>
  );
}

function Field({
  label,
  value,
  multiline,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  multiline?: boolean;
  copied: boolean;
  onCopy: () => void;
}) {
  const shared =
    "mt-1 w-full rounded-md border-[0.5px] border-border bg-surface-2 px-3 py-2 font-mono text-xs";
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted">{label}</span>
        <button
          type="button"
          onClick={onCopy}
          className="rounded border-[0.5px] border-border px-2 py-0.5 text-xs font-medium hover:bg-surface-2"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {multiline ? (
        <textarea
          readOnly
          rows={3}
          value={value}
          onFocus={(e) => e.currentTarget.select()}
          className={`${shared} resize-none`}
        />
      ) : (
        <input
          readOnly
          value={value}
          onFocus={(e) => e.currentTarget.select()}
          className={shared}
        />
      )}
    </div>
  );
}
