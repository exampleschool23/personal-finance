"use client";
import { useState } from 'react';
import type { DemoWorkspace } from '@/lib/demo-finance';
import type { HoldingAccount } from '@/lib/holding-accounts';
import { emptyTags, type TagData } from '@/lib/tags';

const noPlanning: Pick<DemoWorkspace,'goals'|'occurrences'|'categories'> = {goals:[],occurrences:[],categories:[]};

/** What the sample workspace keeps besides its records: investment accounts, goals and schedules, categories and
 * tags, seeded from the backend's sample and changed locally for the visit. */
export function useSampleWorkspace() {
    const [demoHoldingAccounts,setDemoHoldingAccounts]=useState<HoldingAccount[]>([]);
    const [demoPlanning,setDemoPlanning]=useState(noPlanning);
    const [demoTags,setDemoTags]=useState<TagData>(emptyTags);
    const seedSample = (sample: DemoWorkspace) => { setDemoHoldingAccounts(sample.holdingAccounts); setDemoPlanning({goals:sample.goals,occurrences:sample.occurrences,categories:sample.categories}); setDemoTags(sample.tags); };
    const clearSample = () => { setDemoHoldingAccounts([]); setDemoPlanning(noPlanning); setDemoTags(emptyTags); };
    return { demoHoldingAccounts, setDemoHoldingAccounts, demoPlanning, demoTags, seedSample, clearSample };
}
