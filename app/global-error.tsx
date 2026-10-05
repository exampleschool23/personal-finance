"use client";
import "./globals.css";
import { ErrorScreen, type BoundaryError } from '@/components/error-screen';
/** Replaces the root layout when that layout itself fails, so it brings its own document. */
export default function GlobalError({ error, reset }: { error: BoundaryError; reset: () => void }) {
 return <html lang="en"><body className="antialiased"><ErrorScreen error={error} reset={reset}/></body></html>;
}
