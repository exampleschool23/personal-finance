"use client";
import {Suspense} from 'react';
import {useSearchParams} from 'next/navigation';
import {LanguageProvider,LanguageSelector} from '@/components/language-provider';
import {AccountAccessPanel} from '@/components/account-access-panel';
function Confirmation(){const query=useSearchParams();return <AccountAccessPanel tokenHash={query.get('token_hash')??''} tokenType={query.get('type')??'email'}/>;}
export default function Confirm(){return <LanguageProvider><main className="content"><LanguageSelector/><Suspense><Confirmation/></Suspense></main></LanguageProvider>;}
