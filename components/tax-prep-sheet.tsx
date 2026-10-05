"use client";
import { useMemo, useState } from 'react';
import { ChevronDown, Download, FileSpreadsheet } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { BusinessName, type ReportNames } from '@/components/business-reports';
import type { BusinessOption } from '@/components/presentation-foundation/business-filter';
import { CategoryIcon } from '@/components/presentation-foundation/category-icon';
import { EmptyState } from '@/components/presentation-foundation/empty-state';
import { ErrorPopup } from '@/components/presentation-foundation/error-popup';
import { PanelTitle } from '@/components/presentation-foundation/panel-title';
import { Segmented } from '@/components/presentation-foundation/segmented';
import { StatTile, StatTiles } from '@/components/presentation-foundation/stat-tile';
import { signTone } from '@/components/presentation-foundation/tone';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { NativeSelect } from '@/components/ui/native-select';
import type { LedgerLine } from '@/lib/business-report';
import { taxExportRows, taxFormLinks, taxLines, taxPeriods, taxSheet, taxTemplateLabels, taxTemplates, type TaxCategory, type TaxExportDetail, type TaxPeriod, type TaxSettings } from '@/lib/business-tax';
import { exportCSV } from '@/lib/csv';
import { depositToday } from '@/lib/deposit-interest';
import { formatDate, formatMoney, formatNumber, formatYear } from '@/lib/format';
import { pdfUnsupportedLanguages } from '@/lib/languages';
import { RollingText } from '@/components/presentation-foundation/rolling-text';

const periodLabels: Record<TaxPeriod, string> = { year: 'Full year', q1: 'Q1', q2: 'Q2', q3: 'Q3', q4: 'Q4' };

type Props = {
 lines: readonly LedgerLine[]; businesses: readonly BusinessOption[]; business: string; onBusiness: (id: string) => void;
 year: number; years: number[]; onYear: (year: number) => void; period: TaxPeriod; onPeriod: (period: TaxPeriod) => void;
 categories: ReadonlyArray<{ key: string; direction: 'income' | 'expense' }>;
 settings: TaxSettings; onSettings: (settings: TaxSettings) => Promise<void>; names: ReportNames; currency: string;
 onOpen?: (line: LedgerLine) => void;
};

/** Business tax prep: one business's categories sorted into the lines of a sole proprietor's return, ready
 * to export for tax preparation or an accountant. A worksheet only; it gives no tax advice. */
export function TaxPrepSheet({ lines, businesses, business, onBusiness, year, years, onYear, period, onPeriod, categories, settings, onSettings, names, currency, onOpen }: Props) {
 const { t, locale } = useLanguage();
 const [allCategories, setAllCategories] = useState(false), [previewing, setPreviewing] = useState(false), [error, setError] = useState('');
 const sheet = useMemo(() => taxSheet(lines, settings, names.category, allCategories ? categories : []), [lines, settings, names.category, allCategories, categories]);
 const money = (amount: number) => formatMoney(amount, currency, locale);
 const numbered = settings.template === 'schedule_c', form = taxFormLinks[settings.template];
 async function move(category: TaxCategory, line: string | null) {
  setError('');
  try { await onSettings({ ...settings, lines: { ...settings.lines, [category.key]: line } }); }
  catch (reason) { setError(t((reason as Error).message || 'Could not save changes.')); }
 }
 const categoryRow = (category: TaxCategory) => <li key={category.key} className="tax-category">
  <span className="tax-category-name"><CategoryIcon kind={names.icon(category.key)} size="sm"/><span>{names.category(category.key)}<small>{t('{count} transactions', { count: formatNumber(category.transactions.length, locale, 0) })}</small></span></span>
  <strong>{money(category.amount)}</strong>
  <label className="tax-move"><span className="sr-only">{t('Move {name} to another line', { name: names.category(category.key) })}</span>
   <NativeSelect value={sheet.lines.find(item => item.categories.includes(category))?.line.id ?? ''} onChange={event => void move(category, event.currentTarget.value || null)}>
    <option value="">{t('Not on the sheet')}</option>
    {taxLines.filter(line => line.part === category.direction && !line.manual).map(line => <option key={line.id} value={line.id}>{numbered ? `${line.number} · ` : ''}{t(line.label)}</option>)}
   </NativeSelect>
  </label>
  {category.transactions.length > 0 && <details className="tax-transactions"><summary>{t('Transactions')}<ChevronDown size={14} aria-hidden="true"/></summary><ul>{category.transactions.map(item => <li key={item.id}><button type="button" disabled={!onOpen || !item.record} onClick={() => onOpen?.(item)}><span>{item.name}</span><small>{formatDate(item.date, locale)}</small><strong>{money(item.amount)}</strong></button></li>)}</ul></details>}
 </li>;
 const part = (key: 'income' | 'expense', title: string) => <section className="panel tax-part">
  <PanelTitle title={title}/>
  <ol className="tax-lines">{sheet.lines.filter(item => item.line.part === key).map(item => {
   const heading = <>{numbered && <span className="tax-line-number">{item.line.number}</span>}<span>{t(item.line.label)}</span><strong>{item.line.manual ? t('Work out by hand') : money(item.total)}</strong></>;
   return <li key={item.line.id} data-manual={item.line.manual || undefined} data-empty={!item.categories.length || undefined}>
    {item.categories.length > 0 ? <details open><summary className="tax-line-heading"><ChevronDown size={15} aria-hidden="true"/>{heading}</summary><ul>{item.categories.map(categoryRow)}</ul></details> : <div className="tax-line-heading">{heading}</div>}
   </li>;
  })}</ol>
 </section>;
 return <div className="tax-prep">
  <div className="transactions-tools">
   <label className="sr-only" htmlFor="tax-business">{t('Business')}</label>
   <NativeSelect id="tax-business" aria-label={t('Business')} value={business} onChange={event => onBusiness(event.currentTarget.value)}>{businesses.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</NativeSelect>
   <NativeSelect aria-label={t('Tax year')} value={year} onChange={event => onYear(Number(event.currentTarget.value))}>{years.map(item => <option key={item} value={item}>{formatYear(item, locale)}</option>)}</NativeSelect>
   <Segmented label={t('Period')} options={taxPeriods.map(value => ({ value, label: t(periodLabels[value]) }))} value={period} onChange={onPeriod}/>
   <NativeSelect aria-label={t('Lines')} value={settings.template} onChange={event => void onSettings({ ...settings, template: event.currentTarget.value as TaxSettings['template'] }).catch(reason => setError(t((reason as Error).message)))}>{taxTemplates.map(item => <option key={item} value={item}>{t(taxTemplateLabels[item])}</option>)}</NativeSelect>
   <label className="budget-check tax-all"><input type="checkbox" checked={allCategories} onChange={event => setAllCategories(event.currentTarget.checked)}/><span>{t('Include all categories')}</span></label>
   <Button className="tax-export" onClick={() => setPreviewing(true)}><FileSpreadsheet size={16} aria-hidden="true"/>{t('Preview export')}</Button>
  </div>
  <p className="tax-disclaimer">{t('Hoggish is not a tax advisor. Consult a licensed tax professional for advice on filing your taxes.')}{form && <> <a className="panel-link" href={form.href} target="_blank" rel="noreferrer">{form.label}</a></>}</p>
  <StatTiles columns={3} label={t('Business tax prep')}>
   <StatTile label={t('Gross income')} value={money(sheet.grossIncome)} tone={sheet.grossIncome > 0 ? 'positive' : undefined}/>
   <StatTile label={t('Expenses')} value={money(sheet.totalExpenses)}/>
   <StatTile label={t('Net profit or loss')} value={money(sheet.net)} tone={signTone(sheet.net)}/>
  </StatTiles>
  {!lines.length && !allCategories ? <EmptyState className="panel" icon={<FileSpreadsheet/>} title={t('No business transactions')} description={t('Assign transactions or accounts to this business to fill in its sheet.')}/> : <>
   {part('income', t(numbered ? 'Part I · Income' : 'Income'))}
   {part('expense', t(numbered ? 'Part II · Expenses' : 'Expenses'))}
   {sheet.unmapped.length > 0 && <section className="panel tax-part"><PanelTitle title={t('Not on the sheet')} hint={t('These categories are left out of the export until you move them to a line.')}/><ul className="tax-unmapped">{sheet.unmapped.map(categoryRow)}</ul></section>}
   <section className="panel tax-net"><BusinessName id={business} names={names}/><span>{t('Net profit or loss')}</span><strong className={sheet.net < 0 ? 'negative' : 'positive'}><RollingText text={money(sheet.net)}/></strong></section>
  </>}
  <ErrorPopup message={error}/>
  {previewing && <TaxExportDialog sheet={sheet} template={settings.template} title={`${names.business(business)} · ${t(periodLabels[period])} ${formatYear(year, locale)}`} names={names} currency={currency} onClose={() => setPreviewing(false)}/>}
 </div>;
}

/** The export summary, line by line, and the download in the chosen format and detail. */
function TaxExportDialog({ sheet, template, title, names, currency, onClose }: { sheet: ReturnType<typeof taxSheet>; template: TaxSettings['template']; title: string; names: ReportNames; currency: string; onClose: () => void }) {
 const { t, locale, language } = useLanguage();
 const [format, setFormat] = useState<'csv' | 'pdf'>('csv'), [detail, setDetail] = useState<TaxExportDetail>('categories'), [totals, setTotals] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState('');
 const summary = taxExportRows(sheet, template, 'lines', t, names.category);
 const file = title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').toLowerCase() || 'tax-prep';
 function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
 }
 async function download() {
  setBusy(true); setError('');
  try {
   // A PDF in a script the bundled font cannot draw falls back to English labels, as the financial report does.
   const label = format === 'pdf' && pdfUnsupportedLanguages.includes(language) ? (text: string) => text : (text: string) => t(text);
   // The PDF closes with its own totals table; the CSV carries them as its last rows.
   const rows = taxExportRows(sheet, template, detail, label, names.category, totals && format === 'csv');
   const headers = [label('Line'), label('Description'), label('Category'), label('Date'), label('Amount')];
   if (format === 'csv') {
    save(new Blob(['﻿' + exportCSV(rows.map(row => ({ [headers[0]]: row.line, [headers[1]]: row.description, [headers[2]]: row.category, [headers[3]]: row.date, [headers[4]]: row.amount })), headers)], { type: 'text/csv;charset=utf-8' }), file + '.csv');
   } else {
    const [fontResponse, pdf] = await Promise.all([fetch('/fonts/NotoSans-Regular.ttf'), import('@/lib/financial-report-pdf')]);
    if (!fontResponse.ok) throw Error('Could not create the PDF. Please try again.');
    const report = { title, generated: formatDate(depositToday(), locale), locale, blocks: [
     { kind: 'title' as const, text: title },
     { kind: 'text' as const, text: label('Hoggish is not a tax advisor. Consult a licensed tax professional for advice on filing your taxes.') },
     { kind: 'table' as const, text: label('Business tax prep'), headers, widths: [.08, .32, .25, .15, .2], numeric: [4], rows: rows.map(row => [row.line, row.description, row.category, row.date ? formatDate(row.date, locale) : '', formatMoney(row.amount, currency, locale)]) },
     ...(totals ? [{ kind: 'table' as const, text: label('Net profit or loss'), headers: [label('Gross income'), label('Expenses'), label('Net profit or loss')], widths: [.34, .33, .33], numeric: [0, 1, 2], rows: [[formatMoney(sheet.grossIncome, currency, locale), formatMoney(sheet.totalExpenses, currency, locale), formatMoney(sheet.net, currency, locale)]] }] : []),
    ] };
    const bytes = await pdf.renderFinancialReportPdf(report, new Uint8Array(await fontResponse.arrayBuffer()));
    save(new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }), file + '.pdf');
   }
   onClose();
  } catch (reason) { setError(t((reason as Error).message || 'Could not create the PDF. Please try again.')); }
  finally { setBusy(false); }
 }
 return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
  <DialogContent className="record-dialog tax-export-dialog">
   <DialogTitle>{t('Preview export')}</DialogTitle>
   <DialogDescription>{title}</DialogDescription>
   {summary.length ? <table className="pnl-table"><tbody>{summary.map(row => <tr key={row.description}><th scope="row">{row.line && <span className="tax-line-number">{row.line}</span>}{row.description}</th><td>{formatMoney(row.amount, currency, locale)}</td></tr>)}<tr data-kind="total"><th scope="row">{t('Net profit or loss')}</th><td className={sheet.net < 0 ? 'negative' : 'positive'}>{formatMoney(sheet.net, currency, locale)}</td></tr></tbody></table> : <p className="muted">{t('No lines to export yet.')}</p>}
   <div className="budget-dialog-label">{t('File format')}<Segmented label={t('File format')} options={[{ value: 'csv', label: 'CSV' }, { value: 'pdf', label: 'PDF' }] as const} value={format} onChange={setFormat}/></div>
   <div className="budget-dialog-label">{t('Detail')}<Segmented label={t('Detail')} options={[{ value: 'lines', label: t('Line totals') }, { value: 'categories', label: t('With categories') }, { value: 'transactions', label: t('With transactions') }] as const} value={detail} onChange={setDetail}/></div>
   <label className="budget-check"><input type="checkbox" checked={totals} onChange={event => setTotals(event.currentTarget.checked)}/><span>{t('Include totals')}</span></label>
   {error && <p className="form-error" role="alert">{error}</p>}
   <div className="record-form-footer"><Button variant="outline" onClick={onClose} disabled={busy}>{t('Cancel')}</Button><Button onClick={() => void download()} disabled={busy || !summary.length}><Download size={16} aria-hidden="true"/>{t(busy ? 'Preparing…' : 'Download prep sheet')}</Button></div>
  </DialogContent>
 </Dialog>;
}
