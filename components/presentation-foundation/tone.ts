import type { StatTone } from '@/components/presentation-foundation/stat-tile';

/**
 * The tone of a signed figure: negative below zero, positive otherwise.
 * Pass `negativeOnly` where a surplus is not a success state (a net position, a remainder).
 * Unknown values have no tone.
 */
export function signTone(value: number | null | undefined, negativeOnly = false): StatTone | undefined {
 if (value === null || value === undefined || Number.isNaN(value)) return undefined;
 if (value < 0) return 'negative';
 return negativeOnly ? undefined : 'positive';
}

/** The tone of an amount owed, stored as a positive number: negative while anything is owed, none at zero. */
export const liabilityTone = (owed: number | null | undefined): StatTone | undefined => signTone(owed === null || owed === undefined ? owed : -owed, true);
