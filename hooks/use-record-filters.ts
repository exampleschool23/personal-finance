"use client";
import { useState } from 'react';
import { emptyRecordFilters, type RecordFiltersValue } from '@/lib/record-filters';
export function useRecordFilters(section:string,owner:string|null){
 const [state,setState]=useState<{owner:string|null;sections:Record<string,RecordFiltersValue>}>({owner,sections:{}});
 if(state.owner!==owner)setState({owner,sections:{}});
 return {filters:state.owner===owner?state.sections[section]??emptyRecordFilters:emptyRecordFilters,setFilters:(filters:RecordFiltersValue)=>setState(previous=>({owner,sections:{...(previous.owner===owner?previous.sections:{}),[section]:filters}}))};
}
