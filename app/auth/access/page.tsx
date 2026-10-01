"use client";
import {Suspense} from 'react';
import {useSearchParams} from 'next/navigation';
import {LanguageProvider} from '@/components/language-provider';
import {AccountAccessPanel} from '@/components/account-access-panel';
import {Brand} from '@/components/presentation-foundation/brand';
// The sign-in page links here with the chosen purpose, so a new account never sees the password recovery form.
function Access(){const query=useSearchParams();return <AccountAccessPanel intent={query.get('mode')==='signup'?'signup':'recover'}/>;}
export default function AccessPage(){return <LanguageProvider><main className="auth-page"><header className="auth-page-header"><Brand/></header><Suspense><Access/></Suspense></main></LanguageProvider>;}
