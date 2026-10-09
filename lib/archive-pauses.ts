import { archivedIn, type ArchivePause } from './finance';

export { archivedIn, type ArchivePause };

/** The pauses after archiving or restoring today, as the database trigger keeps them (for the sample workspace). */
export function nextArchivePauses(pauses: readonly ArchivePause[] | null | undefined, archived: boolean, today: string): ArchivePause[] {
 const list = pauses ?? [];
 if (archived) return [...list, { from: today, to: null }];
 return list.filter(pause => !(pause.to === null && pause.from === today)).map(pause => pause.to === null ? { ...pause, to: today } : pause);
}
