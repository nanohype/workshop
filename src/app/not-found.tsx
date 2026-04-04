import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Not Found',
};

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <h1 className="text-6xl font-bold text-foreground mb-2 font-display">404</h1>
      <p className="text-lg text-muted-foreground mb-6">Page not found</p>
      <Link
        href="/"
        className="text-sm text-accent hover:text-accent/80 underline underline-offset-4"
      >
        Back to Dashboard
      </Link>
    </div>
  );
}
