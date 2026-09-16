"use client";
import { useEffect, useState } from 'react';
import { ArrowUpRight, ArrowDownLeft, ChartNoAxesCombined, Wallet, ShieldCheck, LayoutDashboard, Landmark, HandCoins, Plus, LogOut, Pencil, Trash2, ChevronRight, Bitcoin, Building2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LanguageSelector, useLanguage } from '@/components/language-provider';
import { ThemeToggle } from '@/components/theme-provider';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogClose } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel, AlertDialogFooter } from '@/components/ui/alert-dialog';
import { SidebarProvider, Sidebar, SidebarContent, SidebarHeader, SidebarFooter, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarTrigger } from '@/components/ui/sidebar';
import { Entry, kinds, assets, liabilities, income, expenses, value, monthly } from '@/lib/finance';
const today = () => new Date().toISOString().slice(0, 10);
const fresh = (): Entry => ({ id: crypto.randomUUID(), name: '', kind: 'Cash', currency: 'USD', amount: 0, quantity: 1, cost: 0, rate: 0, date: today(), frequency: 'Once', notes: '' });
const sample = (): Entry[] => [
    ['Savings account', 'Cash', 'USD', 8500], ['Apple', 'Stock', 'USD', 225, 20, 190], ['Bitcoin', 'Crypto', 'USD', 60000, .08, 52000], ['Term deposit', 'Deposit', 'UZS', 50000000], ['Apartment mortgage', 'Mortgage', 'USD', 18000], ['Loan to a friend', 'Money lent', 'USD', 1200], ['Monthly salary', 'Salary', 'UZS', 18000000], ['Apartment rent', 'Rent expense', 'UZS', 4500000], ['Groceries & everyday', 'Living expense', 'UZS', 2000000]
].map((a, i) => ({ ...fresh(), name: String(a[0]), kind: a[1] as Entry['kind'], currency: a[2] as Entry['currency'], amount: Number(a[3]), quantity: Number(a[4] ?? 1), cost: Number(a[5] ?? 0), frequency: i >= 6 ? 'Monthly' : 'Once' }));
const sections = [['Overview', LayoutDashboard], ['Assets & investments', ChartNoAxesCombined], ['Income & expenses', ArrowDownLeft], ['Loans & debts', HandCoins]] as const;
export default function Home() {
    const { t, locale } = useLanguage();
    const formatDate = (value: string) => { const date = new Date(value + 'T00:00:00Z'); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale, { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'UTC' }).format(date); };
    const preferences = <div className="preferences"><LanguageSelector /><ThemeToggle /></div>;
    const [user, setUser] = useState<string | null>(null), [ready, setReady] = useState(false), [configured, setConfigured] = useState(true), [demo, setDemo] = useState(false), [rows, setRows] = useState<Entry[]>([]), [section, setSection] = useState('Overview'), [currency, setCurrency] = useState<'USD' | 'UZS'>('USD'), [editing, setEditing] = useState<Entry | null>(null), [deleting, setDeleting] = useState<Entry | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
    const money = (n: number, c = currency) => new Intl.NumberFormat(locale, { style: 'currency', currency: c, maximumFractionDigits: c === 'UZS' ? 0 : 2 }).format(n);
    async function load() { const r = await fetch('/api/records'); const d = await r.json() as Entry[] & {
        error?: string;
    }; if (!r.ok)
        throw new Error(d.error); setRows(d.map((e: Entry) => ({ ...e, amount: Number(e.amount), quantity: Number(e.quantity), cost: Number(e.cost), rate: Number(e.rate) }))); }
    useEffect(() => { const url = new URL(window.location.href); const authError = url.searchParams.get('auth_error'); if (authError) {
        const messages: Record<string, string> = { google_setup: 'Google sign-in is awaiting setup. You can still sign in with email.', google_unavailable: 'Google sign-in is temporarily unavailable. Please try again.', google_cancelled: 'Google sign-in was not completed. Please try again.', google_expired: 'Your sign-in attempt expired. Please start again.', google_failed: 'Google sign-in failed. Please try again or use email.' };
        setError(messages[authError] ?? 'Sign-in could not be completed. Please try again.');
        url.searchParams.delete('auth_error');
        window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    } fetch('/api/auth').then(r => r.json() as Promise<{
        configured: boolean;
        user: null | {
            email: string;
        };
    }>).then(async (d) => { setConfigured(d.configured); if (d.user) {
        setUser(d.user.email);
        await load();
    } }).catch(e => setError(e.message)).finally(() => setReady(true)); }, []);
    useEffect(() => { const ctx = (document as unknown as {
        modelContext?: {
            registerTool: (t: unknown, o: unknown) => void;
        };
    }).modelContext; if (!ctx)
        return; const controller = new AbortController(); try {
        ctx.registerTool({ name: 'start_finance_record', description: 'Open the finance record form. Does not save a record.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: false }, execute: (input: unknown) => { if (!input || typeof input !== 'object' || Object.keys(input).length)
                throw Error('No fields accepted.'); if (!user && !demo)
                throw Error('Sign in first.'); setEditing(fresh()); return { status: 'form_opened' }; } }, { signal: controller.signal });
    }
    catch { } return () => controller.abort(); }, [user, demo]);
    async function login(e: React.FormEvent<HTMLFormElement>) { e.preventDefault(); setBusy(true); setError(''); try {
        const f = new FormData(e.currentTarget);
        const r = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(f)) });
        const d = await r.json() as {
            error?: string;
            user: {
                email: string;
            };
        };
        if (!r.ok)
            throw Error(d.error);
        setUser(d.user.email);
        await load();
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    async function save(e: React.FormEvent) { e.preventDefault(); if (!editing)
        return; setBusy(true); setError(''); try {
        if (!demo) {
            const r = await fetch('/api/records', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editing) });
            if (!r.ok)
                throw Error((await r.json() as {
                    error: string;
                }).error);
        }
        setRows(prev => [editing, ...prev.filter(r => r.id !== editing.id)]);
        setEditing(null);
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    async function remove() { if (!deleting)
        return; setBusy(true); setError(''); try {
        if (!demo) {
            const r = await fetch('/api/records', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: deleting.id }) });
            if (!r.ok)
                throw Error((await r.json() as {
                    error: string;
                }).error);
        }
        setRows(prev => prev.filter(r => r.id !== deleting.id));
        setDeleting(null);
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    async function logout() { if (!demo) {
        const r = await fetch('/api/auth', { method: 'DELETE' });
        if (!r.ok) {
            setError('Could not sign out. Please try again.');
            return;
        }
    } setUser(null); setDemo(false); setRows([]); setError(''); }
    const brand = <div className="brand"><span className="mark">h.</span><span>HOGGISH<small className="block">{t("PERSONAL FINANCE")}</small></span></div>;
    if (!user && !demo)
        return <main className="login"><section className="intro">{brand}<div><p className="eyebrow">{t("YOUR MONEY. THE WHOLE PICTURE.")}</p><h1>{t("A clear view.")}<br />{t("A stronger future.")}</h1><p className="lede">{t("From your next payday to your long-term investments.")}<br />{t("Keep your financial life in one place.")}</p><div className="feature-row"><Wallet /><span>USD & UZS</span><ChartNoAxesCombined /><span>{t("Assets & investments")}</span></div></div><p className="muted">{t("Personal finance, thoughtfully organized.")}</p></section><section className="login-panel"><div className="login-preferences">{preferences}</div><div className="login-box"><ShieldCheck className="login-icon"/><p className="eyebrow">{t("YOUR PRIVATE WORKSPACE")}</p><h2>{t("Welcome back.")}</h2><p className="muted">{t("Sign in to your financial overview.")}</p><form action="/api/auth/google" method="post" className="google-form"><Button type="submit" variant="outline" className="google-button" disabled={busy || !ready || !configured}>{t("Continue with Google")}</Button></form><div className="login-divider"><span>{t("or sign in with email")}</span></div><form onSubmit={login}><label>{t("Email address")}<Input name="email" type="email" placeholder="you@example.com" required autoComplete="username"/></label><label>{t("Password")}<Input name="password" type="password" placeholder={t("Enter your password")} required autoComplete="current-password"/></label><Button className="primary" disabled={busy || !ready || !configured}>{busy ? t("Signing in…") : t("Sign in")} <ArrowUpRight size={18}/></Button></form>{error && <p className="error" role="alert">{t(error)}</p>}{ready && !configured && <p className="setup-note">{t("Account connection is awaiting setup. You can explore the sample workspace below.")}</p>}<Button variant="ghost" className="demo-button" onClick={() => { setRows(sample()); setDemo(true); setError(''); }}>{t("Explore sample workspace")} <ChevronRight size={16}/></Button><p className="login-note">{t("Access is by invitation. Your administrator creates your account.")}</p></div></section></main>;
    const current = rows.filter(r => r.currency === currency), sum = (types: readonly string[]) => current.filter(r => types.includes(r.kind)).reduce((n, r) => n + value(r), 0), totalAssets = sum(assets), totalDebt = sum(liabilities), monthlyIncome = current.filter(r => income.includes(r.kind)).reduce((n, r) => n + monthly(r), 0), monthlyExpense = current.filter(r => expenses.includes(r.kind)).reduce((n, r) => n + monthly(r), 0);
    const visible = current.filter(r => section === 'Overview' || (section === 'Assets & investments' ? assets : section === 'Loans & debts' ? liabilities : [...income, ...expenses]).includes(r.kind));
    const allocation = assets.map(k => ({ kind: k, total: sum([k]) })).filter(x => x.total > 0);
    const cashFlowSection = section === 'Income & expenses';
    const editingCashFlow = !!editing && [...income, ...expenses].includes(editing.kind);
    const addCashFlow = (kind: Entry['kind']) => { setError(''); setEditing({ ...fresh(), currency, kind, frequency: 'Monthly' }); };
    const addRecord = () => { setError(''); setEditing({ ...fresh(), currency, ...(cashFlowSection ? { kind: 'Other expense' as const, frequency: 'Monthly' as const } : {}) }); };
    const field = (key: keyof Entry, v: string | number) => setEditing(p => p ? { ...p, [key]: v } : p);
    return <SidebarProvider><Sidebar><SidebarHeader className="p-6">{brand}</SidebarHeader><SidebarContent className="px-4 pt-8"><p className="nav-label">{t("WORKSPACE")}</p><SidebarMenu>{sections.map(([name, Icon]) => <SidebarMenuItem key={name}><SidebarMenuButton className="nav-item" isActive={section === name} onClick={() => setSection(name)}><Icon /><span>{t(name)}</span></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu><div className="sidebar-card"><ShieldCheck size={23}/><strong>{t("Your money, your space.")}</strong><p>{demo ? t("Explore with sample data. Changes last until you leave this workspace.") : t("Your records are private to your account.")}</p></div></SidebarContent><SidebarFooter className="p-5"><div className="user-line"><span className="avatar">{demo ? 'D' : user?.slice(0, 1).toUpperCase()}</span><div><strong>{demo ? t("Demo workspace") : t("Personal account")}</strong><p>{demo ? t("Sample data") : user}</p></div></div><Button variant="ghost" onClick={logout}><LogOut size={16}/>{demo ? t("Exit demo") : t("Sign out")}</Button></SidebarFooter></Sidebar><main className="workspace"><header className="topbar"><div className="flex items-center gap-3"><SidebarTrigger aria-label={t('Toggle Sidebar')}/><span>{t("My workspace")}</span><ChevronRight size={14}/><span className="muted">{t(section)}</span></div>{preferences}</header><div className="content">{demo && <div className="demo-banner"><span>{t("DEMO MODE")}</span> {t("Sample balances · Changes are not saved to an account.")}</div>}<div className="page-heading"><div><p className="eyebrow">{t("FINANCIAL WORKSPACE")}</p><h1>{section === 'Overview' ? t("Your money at a glance.") : t(section)}</h1><p className="muted">{section === 'Overview' ? t("Everything you own, earn, and owe. In one place.") : cashFlowSection ? t("Plan recurring income and expenses, or add a one-time entry.") : t("Manage your records and keep your balances up to date.")}</p></div><div className="entry-actions">{cashFlowSection ? <><Button variant="outline" onClick={() => addCashFlow('Other income')}><Plus size={18}/>{t("Add income")}</Button><Button className="primary" onClick={() => addCashFlow('Other expense')}><Plus size={18}/>{t("Add expense")}</Button></> : <Button className="primary" onClick={addRecord}><Plus size={18}/>{t("Add record")}</Button>}</div></div><div className="currency-bar"><div className="currency-switch" aria-label={t("Display currency")}>{(['USD', 'UZS'] as const).map(c => <button key={c} aria-pressed={currency === c} className={currency === c ? 'selected' : ''} onClick={() => setCurrency(c)}>{c === 'USD' ? '$ USD' : 'UZS'}</button>)}</div><span>{t('Balances shown in {currency}. No currency conversion.', { currency })}</span></div>{error && <div className="error" role="alert">{t(error)}</div>}{cashFlowSection ? <div className="metrics recurring-metrics"><article><p>{t("Monthly recurring income")}</p><h2 className="positive">{money(monthlyIncome)}</h2><small>{t("Monthly amounts plus yearly amounts ÷ 12")}</small></article><article><p>{t("Monthly recurring expenses")}</p><h2>{money(monthlyExpense)}</h2><small>{t("Monthly amounts plus yearly amounts ÷ 12")}</small></article><article><p>{t("Left after recurring expenses")}</p><h2 className={monthlyIncome - monthlyExpense >= 0 ? 'positive' : 'negative'}>{money(monthlyIncome - monthlyExpense)}</h2><small>{t("One-time entries are excluded")}</small></article></div> : <div className="metrics"><article className="net-worth"><p>{t("NET WORTH")} <Wallet size={18}/></p><h2>{money(totalAssets - totalDebt)}</h2><small>{t("Assets minus outstanding debt")}</small><div className="net-line"/></article><article><p>{t("Total assets")} <Landmark size={18}/></p><h2>{money(totalAssets)}</h2><small>{t('Assets in {currency}: {count}', { currency, count: current.filter(r => assets.includes(r.kind)).length })}</small></article><article><p>{t("Outstanding debt")} <HandCoins size={18}/></p><h2>{money(totalDebt)}</h2><small>{t("Mortgages, loans & other debts")}</small></article><article><p>{t("Monthly cash flow")} <ArrowUpRight size={18}/></p><h2 className={monthlyIncome - monthlyExpense >= 0 ? 'positive' : 'negative'}>{money(monthlyIncome - monthlyExpense)}</h2><small>{t("Recurring income minus expenses")}</small></article></div>}{section === 'Overview' && <div className="insights"><section className="panel"><div className="panel-title"><h2>{t("Asset allocation")}</h2><span>{t("Current balances")}</span></div>{allocation.length ? <><div className="allocation-bar">{allocation.map((a, i) => <div key={a.kind} style={{ width: `${a.total / totalAssets * 100}%`, background: ['#c4f36b', '#739f80', '#8b9fe4', '#e6bd73', '#9b85b5', '#70bcb8'][i] }}/>)}</div><div className="allocation-list">{allocation.map((a, i) => <div key={a.kind}><span><i style={{ background: ['#c4f36b', '#739f80', '#8b9fe4', '#e6bd73', '#9b85b5', '#70bcb8'][i] }}/>{t(a.kind)}</span><strong>{money(a.total)}</strong><span>{Math.round(a.total / totalAssets * 100)}%</span></div>)}</div></> : <div className="empty"><Landmark /><p>{t("Add your first asset to see its allocation.")}</p></div>}</section><section className="panel"><div className="panel-title"><h2>{t("Monthly commitments")}</h2><span>{t("Recurring only")}</span></div><div className="cash-row"><span className="icon-box"><ArrowDownLeft /></span><div><p>{t("Income")}</p><small>{t("Salary, rent received & more")}</small></div><strong className="positive">{money(monthlyIncome)}</strong></div><div className="cash-row"><span className="icon-box outgoing"><ArrowUpRight /></span><div><p>{t("Expenses")}</p><small>{t("Rent, living costs & more")}</small></div><strong>{money(monthlyExpense)}</strong></div><div className="cash-footer"><span>{t("Left after expenses")}</span><strong>{money(monthlyIncome - monthlyExpense)}</strong></div><p className="footnote">{t("Yearly records are divided by 12. One-time records are excluded.")}</p></section></div>}<section className="panel records"><div className="panel-title"><h2>{section === 'Overview' ? t("All records") : t(section)} <span className="count">{visible.length}</span></h2><span>{t("Values entered manually")}</span></div>{visible.length ? <div className="table-scroll"><table><thead><tr><th>{t("Name")}</th><th>{t("Category")}</th><th>{cashFlowSection ? t("Start / record date") : t("Date / due date")}</th>{cashFlowSection && <th>{t("Repeats")}</th>}<th>{cashFlowSection ? t("Amount per occurrence") : t("Value")}</th><th><span className="sr-only">{t("Actions")}</span></th></tr></thead><tbody>{visible.map(r => <tr key={r.id}><td><div className="record-name"><span className="record-icon">{r.kind === 'Crypto' ? <Bitcoin /> : r.kind === 'Property' || r.kind === 'Mortgage' ? <Building2 /> : <Wallet />}</span><div><strong>{r.name}</strong><small>{['Stock', 'Crypto'].includes(r.kind) ? t('{quantity} units · Gain/loss {amount}', { quantity: r.quantity, amount: money((r.amount - r.cost) * r.quantity) }) : r.frequency === 'Once' ? (r.rate ? t('{rate}% annual interest', { rate: r.rate }) : r.notes || t("One-time record")) : t(r.frequency)}</small></div></div></td><td><span className="badge">{t(r.kind)}</span></td><td className="muted">{formatDate(r.date)}</td>{cashFlowSection && <td><span className="badge">{r.frequency === 'Once' ? t("One time") : r.frequency === 'Monthly' ? t("Every month") : t("Every year")}</span></td>}<td className="amount">{money(value(r))}</td><td><div className="row-actions"><Button size="icon" variant="ghost" aria-label={t('Edit {name}', { name: r.name })} onClick={() => { setError(''); setEditing({ ...r }); }}><Pencil size={15}/></Button><Button size="icon" variant="ghost" aria-label={t('Delete {name}', { name: r.name })} onClick={() => setDeleting(r)}><Trash2 size={15}/></Button></div></td></tr>)}</tbody></table></div> : <div className="empty"><Wallet /><h3>{t("A fresh start.")}</h3><p>{t('Add a record in {currency} to start building your overview.', { currency })}</p><Button variant="outline" onClick={addRecord}><Plus />{cashFlowSection ? t("Add your first expense") : t("Add your first record")}</Button></div>}</section><p className="bottom-note"><ShieldCheck size={14}/>{demo ? t("Sample data for exploring the app.") : t("Private records · Only visible to your account.")}</p></div></main>
 <Dialog open={!!editing} onOpenChange={open => { if (!open && !busy)
        setEditing(null); }}><DialogContent className="record-dialog" showCloseButton={false}><DialogClose className="absolute top-4 right-4" aria-label={t('Close')} disabled={busy}><X size={18}/></DialogClose><DialogTitle>{rows.some(r => r.id === editing?.id) ? t("Edit record") : editingCashFlow ? (income.includes(editing!.kind) ? t("Add income") : t("Add expense")) : t("Add a record")}</DialogTitle><DialogDescription>{editingCashFlow ? t("Enter an amount and choose how often it repeats.") : t("Keep a current balance or record income and expenses.")}</DialogDescription>{editing && <form onSubmit={save}><label>{t("Name")}<Input value={editing.name} onChange={e => field('name', e.target.value)} maxLength={120} placeholder={editingCashFlow ? (income.includes(editing.kind) ? t("e.g. Monthly salary") : t("e.g. Rent or internet subscription")) : t("e.g. Savings account")} required/></label><div className="form-grid"><label>{t("Category")}<select value={editing.kind} onChange={e => field('kind', e.target.value)}>{(cashFlowSection && editingCashFlow ? kinds.filter(k => [...income, ...expenses].includes(k)) : kinds).map(k => <option key={k} value={k}>{t(k)}</option>)}</select></label><label>{t("Currency")}<select value={editing.currency} onChange={e => field('currency', e.target.value)}><option>USD</option><option>UZS</option></select></label></div><label>{['Stock', 'Crypto'].includes(editing.kind) ? t("Current price per unit") : editingCashFlow ? t("Amount per occurrence") : t("Amount / outstanding balance")}<Input type="number" min="0" max="1000000000000000" step="any" value={editing.amount} required onChange={e => field('amount', Number(e.target.value))}/></label>{['Stock', 'Crypto'].includes(editing.kind) && <div className="form-grid"><label>{t("Quantity")}<Input type="number" min="0" step="any" value={editing.quantity} required onChange={e => field('quantity', Number(e.target.value))}/></label><label>{t("Purchase price per unit")}<Input type="number" min="0" step="any" value={editing.cost} required onChange={e => field('cost', Number(e.target.value))}/></label></div>}{['Deposit', 'Money lent', ...liabilities].includes(editing.kind) && <label>{t("Annual interest rate (%)")}<Input type="number" min="0" max="1000" step="any" value={editing.rate} onChange={e => field('rate', Number(e.target.value))}/></label>}<div className="form-grid"><label>{['Deposit', 'Money lent', ...liabilities].includes(editing.kind) ? t("Due / maturity date") : editingCashFlow && editing.frequency !== 'Once' ? t("Start date") : t("Record date")}<Input type="date" value={editing.date} required onChange={e => field('date', e.target.value)}/></label><label>{editingCashFlow ? t("Repeats") : t("Frequency")}<select value={editing.frequency} onChange={e => field('frequency', e.target.value)}><option value="Once">{t("One time")}</option><option value="Monthly">{t("Every month")}</option><option value="Yearly">{t("Every year")}</option></select></label></div>{editingCashFlow && editing.frequency !== 'Once' && <p className="recurrence-help">{t('{amount} {frequency} from {date}. This is a recurring plan; it does not automatically create transactions or change account balances.', { amount: money(editing.amount, editing.currency), frequency: t(editing.frequency === 'Monthly' ? 'every month' : 'every year'), date: formatDate(editing.date) })}</p>}<label>{t("Notes")}<textarea value={editing.notes} maxLength={2000} rows={2} placeholder={t("Account, lender, borrower, or other details")} onChange={e => field('notes', e.target.value)}/></label>{error && <p role="alert" className="error">{t(error)}</p>}<Button className="primary w-full" disabled={busy}>{busy ? t("Saving…") : demo ? t("Save in demo") : t("Save record")}</Button></form>}</DialogContent></Dialog>
 <AlertDialog open={!!deleting} onOpenChange={o => { if (!o && !busy)
        setDeleting(null); }}><AlertDialogContent><AlertDialogTitle>{t("Delete this record?")}</AlertDialogTitle><AlertDialogDescription>{t('{name} will be permanently removed.', { name: deleting?.name ?? '' })}</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel disabled={busy}>{t("Keep record")}</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={e => { e.preventDefault(); void remove(); }}>{t("Delete record")}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></SidebarProvider>;
}
