"use client";
import {LanguageProvider,LanguageSelector} from '@/components/language-provider';
import {AccountAccessPanel} from '@/components/account-access-panel';
import {Brand} from '@/components/brand';
export default function Access(){return <LanguageProvider><main className="auth-page"><header className="auth-page-header"><Brand/><LanguageSelector/></header><AccountAccessPanel/></main></LanguageProvider>;}
