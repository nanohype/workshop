'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body className="bg-background text-foreground flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <h1 className="text-3xl font-bold">Something went wrong</h1>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            A critical error occurred. Error: {error.message}
          </p>
          <button
            onClick={reset}
            className="px-4 py-2 bg-accent hover:bg-accent/90 text-accent-foreground rounded-md text-sm font-medium transition-colors"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
