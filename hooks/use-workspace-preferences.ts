"use client";
import {useOwnerResource,saveOwnerResource} from './use-owner-resource';
import type {WorkspacePreference} from '@/lib/workspace-preferences';
const empty={preferences:[] as WorkspacePreference[]};
export function useWorkspacePreferences(owner:string|null,demo:boolean,revision:number){
 const resource=useOwnerResource('/api/workspace-preferences',owner,!demo,revision,empty);
 return {...resource,save:async(preference:WorkspacePreference)=>{if(demo||!owner)throw Error('Sign in to save planning changes.');if(resource.loading||resource.error)throw Error('Load saved preferences before making changes.');await saveOwnerResource('/api/workspace-preferences','save',preference);resource.invalidate();}};
}
export type PreferenceResource=ReturnType<typeof useWorkspacePreferences>;
