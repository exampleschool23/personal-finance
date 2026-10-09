"use client";
import { Bitcoin, ChartNoAxesCombined, Landmark, Wallet } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';

const accountTypes = [
 {kind:'CashInvestment',title:'Cash investment account',description:'Hold cash in your preferred currencies as an investment.',Icon:Wallet},
 {kind:'Cash',title:'Cash account',description:'Money available for spending, transfers and savings goals.',Icon:Wallet},
 {kind:'Deposit',title:'Interest-bearing deposit',description:'A balance with an annual interest rate, top-ups and withdrawals.',Icon:Landmark},
 {kind:'Stock',title:'Stock account',description:'A brokerage account containing multiple stock holdings.',Icon:ChartNoAxesCombined},
 {kind:'Crypto',title:'Crypto account',description:'An exchange or wallet containing multiple crypto holdings.',Icon:Bitcoin},
] as const;
export type AccountType = typeof accountTypes[number]['kind'];

/** Add account: the kinds of account to choose from; choosing one closes the dialog and hands the kind back. */
export function AddAccountDialog({ open, onOpenChange, onChoose }: { open: boolean; onOpenChange: (open: boolean) => void; onChoose: (kind: AccountType) => void }) {
 const { t } = useLanguage();
 return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="record-dialog"><DialogTitle>{t('Add account')}</DialogTitle><DialogDescription className="sr-only">{t('Choose what you want to keep in this account.')}</DialogDescription><div className="account-type-options">
  {accountTypes.map(({kind,title,description,Icon})=><button key={kind} type="button" onClick={()=>{onOpenChange(false);onChoose(kind);}}><Icon size={24} aria-hidden="true" /><span><strong>{t(title)}</strong><span>{t(description)}</span></span></button>)}
 </div></DialogContent></Dialog>;
}
