"use client";
import { useOwnerResource } from '@/hooks/use-owner-resource';
import { useLanguage } from '@/components/language-provider';
import { InlineError } from '@/components/presentation-foundation/inline-error';
const empty={compatible:false};
export function DatabaseStatus({owner,demo}:{owner:string|null;demo:boolean}){
 const {t}=useLanguage();const resource=useOwnerResource('/api/database-status',owner,!demo,0,empty);
 if(!resource.error)return null;
 return <InlineError as="div" className="panel" message={t(resource.error)} onRetry={resource.retry}/>;
}
