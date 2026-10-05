"use client";
import { useEffect } from 'react';
import { listenForClientErrors } from '@/lib/client-errors';
/** Mounted once in the root layout: reports uncaught browser errors, a few per page load at most. Renders nothing. */
export function ErrorReporter() {
 useEffect(() => listenForClientErrors(window), []);
 return null;
}
