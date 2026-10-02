"use client";
import { useSyncExternalStore } from 'react';

const subscribe = (change: () => void) => { window.addEventListener('popstate', change); return () => window.removeEventListener('popstate', change); };
/** The page's query string (`?business=…`), read without a Suspense boundary; empty while rendering on the server. */
export function useLocationSearch() {
 return useSyncExternalStore(subscribe, () => window.location.search, () => '');
}
/** Applies a query string to a screen's state once per distinct query: links such as /transactions?tag=… open filtered. */
export const queryList = (search: string, key: string) => new URLSearchParams(search).getAll(key).flatMap(value => value.split(',')).filter(Boolean);
