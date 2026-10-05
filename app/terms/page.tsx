import type {Metadata} from 'next';
import {LegalPage} from '@/components/legal-page';
import {VisitorHint} from '@/components/visitor-hint';
export const metadata:Metadata={title:'Terms of use · Hoggish Finance'};
export default function TermsPage(){return <VisitorHint><LegalPage kind="terms"/></VisitorHint>;}
