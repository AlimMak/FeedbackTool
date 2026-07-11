"use client";

// Root error boundary. Also ensures the `global-error` module is present in the
// client manifest, which the Turbopack RSC bundler references when a page
// contains Server Action forms.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="min-h-full flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <h1 className="text-lg font-semibold">Something went wrong</h1>
          <p className="mt-2 text-sm text-slate-500">
            {error.digest ? `Error reference: ${error.digest}` : error.message}
          </p>
          <button
            type="button"
            onClick={reset}
            className="mt-4 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-500"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
