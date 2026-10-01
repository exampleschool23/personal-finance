import type {Metadata} from 'next';
import {LegalPage} from '@/components/legal-page';
export const metadata:Metadata={title:'Privacy policy · Hoggish Finance'};
export default function PrivacyPage(){return <LegalPage kind="privacy"/>;}
