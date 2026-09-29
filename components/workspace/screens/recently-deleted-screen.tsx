"use client";
import { RecentlyDeleted } from '@/components/recently-deleted';
import { useWorkspace } from '@/components/workspace/workspace-provider';

export function RecentlyDeletedScreen() {
 const { demo, deletedItems, restoreDemoItem, discardDeletedItem, refreshRecords } = useWorkspace();
 return <div data-page="Recently deleted" className="content">
  <RecentlyDeleted demo={demo} demoItems={deletedItems} onRestore={restoreDemoItem} onDelete={discardDeletedItem} onSaved={refreshRecords}/>
 </div>;
}
