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
