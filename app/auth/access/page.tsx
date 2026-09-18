"use client";
import {LanguageProvider,LanguageSelector} from '@/components/language-provider';
import {AccountAccessPanel} from '@/components/account-access-panel';
export default function Access(){return <LanguageProvider><main className="content"><LanguageSelector/><AccountAccessPanel/></main></LanguageProvider>;}
