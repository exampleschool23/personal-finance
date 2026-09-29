"use client";
import { useLanguage } from '@/components/language-provider';

/** The product mark and name, shared by the sidebar, sign-in and account pages. */
export function Brand() {
 const { t } = useLanguage();
 return <div className="brand"><span className="mark">h.</span><span>HOGGISH<small className="block">{t("PERSONAL FINANCE")}</small></span></div>;
}
