import type {Metadata} from 'next';
import {LegalPage} from '@/components/legal-page';
import {VisitorHint} from '@/components/visitor-hint';
export const metadata:Metadata={title:'Privacy policy · Hoggish Finance'};
export default function PrivacyPage(){return <VisitorHint><LegalPage kind="privacy"/></VisitorHint>;}
