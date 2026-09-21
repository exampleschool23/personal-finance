"use client";
import { useOwnerResource } from '@/hooks/use-owner-resource';
import { useLanguage } from '@/components/language-provider';
import { Button } from '@/components/ui/button';
const empty={compatible:false};
export function DatabaseStatus({owner,demo}:{owner:string|null;demo:boolean}){
 const {t}=useLanguage();const resource=useOwnerResource('/api/database-status',owner,!demo,0,empty);
 if(!resource.error)return null;
 return <div role="alert" className="error panel">{t(resource.error)} <Button type="button" variant="outline" onClick={resource.retry}>{t('Retry')}</Button></div>;
}
