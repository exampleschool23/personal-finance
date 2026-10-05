"use client";
import { useState } from 'react';
import { BusinessMark } from '@/components/presentation-foundation/business-mark';
import type { BusinessOption } from '@/components/presentation-foundation/business-filter';
import { OwnerAvatar } from '@/components/presentation-foundation/person-avatar';
import { useLanguage } from '@/components/language-provider';
import { queryList, useLocationSearch } from '@/hooks/use-location-search';
import { holdingOwner, inOwnerFilter, ownerChoices, ownerOf, sharedWorkspace, type HouseholdState } from '@/lib/household';
import { HOUSEHOLD, inBusinessFilter, isBusinessAccount } from '@/lib/business';
import { directoryBusiness, type DirectoryItem } from '@/lib/account-directory';
import type { Entry } from '@/lib/finance';
import type { RowDetails } from './account-directory';

/** The Accounts directory's search, business and owner filters, and the marks its rows carry. A business filter
 * comes from the link too (/accounts?business=…, from the dashboard's business rows). Owners exist only in a shared
 * household. */
export function useAccountFilters({ items, records, businesses, household }: { items: DirectoryItem[]; records: Entry[]; businesses: readonly BusinessOption[]; household?: HouseholdState|null }) {
 const { t, locale } = useLanguage();
 const [query,setQuery]=useState('');
 const search=useLocationSearch();
 const [businessFilter,setBusinessFilter]=useState<string[]>([]),[appliedSearch,setAppliedSearch]=useState('');
 if(search!==appliedSearch){setAppliedSearch(search);setBusinessFilter(queryList(search,'business'));}
 const owners=household&&sharedWorkspace(household)?ownerChoices(household,{shared:t('Shared'),unnamed:t('Partner')}):[];
 const [ownerFilter,setOwnerFilter]=useState<string[]>([]);
 const ownerOfItem=(item:DirectoryItem)=>item.key.startsWith('record:')?ownerOf(item.account as Entry,household!):holdingOwner(item.account,household!);
 const named=(item:DirectoryItem)=>item.account.name.toLocaleLowerCase(locale).includes(query.toLocaleLowerCase(locale));
 const visible=items.filter(item=>named(item)&&inBusinessFilter(businessFilter,directoryBusiness(item))&&(!owners.length||inOwnerFilter(ownerFilter,ownerOfItem(item))));
 const details:RowDetails={
  business:item=>{const business=businesses.find(option=>option.id===directoryBusiness(item));return business?{name:business.name,mark:<BusinessMark name={business.name} color={business.business_color} logo={business.business_logo} size="sm"/>}:null;},
  owner:item=>{const owner=owners.find(option=>option.id===ownerOfItem(item));return owner?<OwnerAvatar owner={owner} size="sm"/>:null;},
 };
 // A business filter also lists the business's other assets and debts, so its whole net assets are in view.
 const businessHoldings=businessFilter.some(id=>id!==HOUSEHOLD)?records.filter(record=>isBusinessAccount(record)&&!['Cash','Deposit'].includes(record.kind)&&!!record.business_id&&businessFilter.includes(record.business_id)):[];
 return { query, setQuery, businessFilter, setBusinessFilter, owners, ownerFilter, setOwnerFilter, visible, details, businessHoldings };
}
