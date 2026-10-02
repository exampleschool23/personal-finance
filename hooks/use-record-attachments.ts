"use client";
import { useMemo } from 'react';
import { useOwnerResource } from '@/hooks/use-owner-resource';
import { attachmentCounts, type AttachmentView } from '@/lib/record-attachments';

const empty: { attachments: AttachmentView[] } = { attachments: [] };

/** Which transactions carry receipts. The sample workspace has none and cannot add any. */
export function useRecordAttachments(owner: string | null, demo: boolean, revision: number) {
 const live = !!owner && !demo;
 const remote = useOwnerResource('/api/record-attachments', owner, live, revision, empty);
 const counts = useMemo(() => attachmentCounts(remote.data.attachments), [remote.data.attachments]);
 return { available: live, counts, refresh: remote.invalidate };
}
export type AttachmentsResource = ReturnType<typeof useRecordAttachments>;
