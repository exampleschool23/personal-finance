"use client";
import { ErrorScreen, type BoundaryError } from '@/components/error-screen';
export default function ErrorBoundary({ error, reset }: { error: BoundaryError; reset: () => void }) {
 return <ErrorScreen error={error} reset={reset}/>;
}
