"use client";
import {Suspense} from 'react';
import {useSearchParams} from 'next/navigation';
import {LanguageProvider} from '@/components/language-provider';
import {AccountAccessPanel} from '@/components/account-access-panel';
import {Brand} from '@/components/presentation-foundation/brand';
function Confirmation(){const query=useSearchParams();return <AccountAccessPanel tokenHash={query.get('token_hash')??''} tokenType={query.get('type')??'email'}/>;}
export default function Confirm(){return <LanguageProvider><main className="auth-page"><header className="auth-page-header"><Brand/></header><Suspense><Confirmation/></Suspense></main></LanguageProvider>;}
