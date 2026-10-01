"use client";
import Link from 'next/link';
import {LanguageProvider,useLanguage} from '@/components/language-provider';
import {Brand} from '@/components/presentation-foundation/brand';
import {formatDate} from '@/lib/format';
import {legalPaths,legalUpdated,privacyPolicy,termsOfUse,type LegalDocument} from '@/lib/legal';
const titles={terms:'Terms of use',privacy:'Privacy policy'} as const;
function LegalContent({document}:{document:LegalDocument}){
 const {t,locale,language}=useLanguage();
 const other=document.kind==='terms'?'privacy':'terms';
 return <article className="panel legal-document" lang="en" dir="ltr">
  <h1>{t(titles[document.kind])}</h1>
  <p className="muted">{t('Last updated: {date}',{date:formatDate(legalUpdated,locale)})}</p>
  {language!=='en'&&<p className="legal-language-note" lang={language}>{t('This document is available in English.')}</p>}
  {document.sections.map(section=><section key={section.heading}>
   <h2>{section.heading}</h2>
   {section.paragraphs.map(paragraph=><p key={paragraph}>{paragraph}</p>)}
   {section.items&&<ul>{section.items.map(item=><li key={item}>{item}</li>)}</ul>}
  </section>)}
  <nav className="legal-links" lang={language}><Link href={legalPaths[other]}>{t(titles[other])}</Link><Link href="/">{t('Back to Hoggish')}</Link></nav>
 </article>;
}
/** The public terms or privacy page. Readable signed out, in the browser's language for its headings. */
export function LegalPage({kind}:{kind:'terms'|'privacy'}){
 return <LanguageProvider><main className="auth-page"><header className="auth-page-header"><Brand/></header><LegalContent document={kind==='terms'?termsOfUse:privacyPolicy}/></main></LanguageProvider>;
}
