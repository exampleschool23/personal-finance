"use client";
import { useMemo } from 'react';
import { useWorkspace } from '@/components/workspace/workspace-provider';
import { useOwnerResource } from '@/hooks/use-owner-resource';
import { readableRange, type ReportRange } from '@/lib/business-report';
import { normalizeEntry } from '@/lib/finance';
import { emptyPlanning, type PlanningData } from '@/lib/planning';

/** Planning data for a range: the sample workspace's own records, or a read of at most 24 months. */
export function useRangeData(range: ReportRange) {
 const { user, demo, reload, planning } = useWorkspace();
 const live = !!user && !demo, read = readableRange(range);
 const remote = useOwnerResource(`/api/planning?scope=budget&month=${read.to.slice(0, 7)}&from=${read.from.slice(0, 7)}`, user, live, reload, emptyPlanning);
 const data: PlanningData = useMemo(() => live ? { ...remote.data, records: remote.data.records.map(normalizeEntry) } : planning.data, [live, remote.data, planning.data]);
 return { data, loading: live ? remote.initialLoading : planning.loading, error: live ? remote.error : planning.error, retry: live ? remote.retry : () => undefined };
}
