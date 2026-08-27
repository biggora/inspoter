import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "404 — Page not found",
  description: "The requested page does not exist.",
};

export default function GlobalNotFound() {
  return (
    <html lang="en">
      <body className="bg-background text-foreground antialiased">
        <main className="flex min-h-svh items-center justify-center p-6">
          <div className="max-w-md text-center">
            <p className="text-sm font-medium text-muted-foreground">404</p>
            <h1 className="mt-2 font-heading text-3xl font-bold">
              Page not found
            </h1>
            <p className="mt-3 text-muted-foreground">
              The requested page does not exist or may have moved.
            </p>
            <Link
              href="/login"
              className="mt-6 inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
            >
              Go to sign in
            </Link>
          </div>
        </main>
      </body>
    </html>
  );
}
