"use client";
import {Suspense} from 'react';
import {useSearchParams} from 'next/navigation';
import {LanguageProvider} from '@/components/language-provider';
import {AccountAccessCard} from '@/components/account-access-card';
import {Brand} from '@/components/presentation-foundation/brand';
// The sign-in page links here with the chosen purpose, so a new account never sees the password recovery form.
function Access(){const query=useSearchParams();return <AccountAccessCard brand={<Brand/>} intent={query.get('mode')==='signup'?'signup':'recover'}/>;}
export default function AccessPage(){return <LanguageProvider><Suspense><Access/></Suspense></LanguageProvider>;}
