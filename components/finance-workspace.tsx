"use client";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import { ArrowUpRight, ArrowDownLeft, ChartNoAxesCombined, Wallet, ShieldCheck, LayoutDashboard, Landmark, HandCoins, Plus, LogOut, Pencil, Trash2, ChevronRight, Bitcoin, Building2, X, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { LanguageProvider, LanguageSelector, useLanguage } from '@/components/language-provider';
import { ThemeToggle } from '@/components/theme-provider';
import { formatMoney, formatNumber, formatDate as sharedFormatDate, formatDateTime } from '@/lib/format';
import { FormattedNumberInput } from '@/components/formatted-number-input';
import { ExpensePlans } from '@/components/expense-plans';
import { useExpensePlans } from '@/hooks/use-expense-plans';
import { expensePlanTotals, type ExpensePlan } from '@/lib/expense-plans';
import { depositToday } from '@/lib/deposit-interest';
import { InvestmentTracker } from '@/components/investment-tracker';
import { trackedKinds } from '@/lib/investment-history';
import { EstimatedIncomeSources } from '@/components/estimated-income-sources';
import { AssetDistribution } from '@/components/asset-distribution';
import { SettingsPanel } from '@/components/settings-panel';
import { defaultPreferences, currencyLabel, type Preferences } from '@/lib/currencies';
import { MortgagePaymentDialog, type MortgagePayment } from '@/components/mortgage-payment-dialog';
import { CategoryBadge } from '@/components/category-badge';
import { categoryColor } from '@/lib/category-colors';
import { RecordNameInput } from '@/components/record-name-input';
import { DatePicker } from '@/components/date-picker';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogClose } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel, AlertDialogFooter } from '@/components/ui/alert-dialog';
import { SidebarProvider, Sidebar, SidebarContent, SidebarHeader, SidebarFooter, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarTrigger } from '@/components/ui/sidebar';
import { coins, coinName, instrumentFor, instrumentKey, convertAmount, marketEntry } from '@/lib/market';
import { useMarket, fetchMarket } from '@/hooks/use-market';
import { Entry, kinds, assets, liabilities, assetRecordKinds, lendingRecordKinds, income, expenses, value, monthly, estimatedCashFlow } from '@/lib/finance';
const today = () => new Date().toISOString().slice(0, 10);
const fresh = (): Entry => ({ id: crypto.randomUUID(), name: '', kind: 'Cash', currency: 'USD', amount: 0, quantity: 1, cost: 0, rate: 0, date: today(), lent_date: today(), frequency: 'Once', notes: '', business_id: null, ownership_percentage: 100, estimated_monthly_income: 0, estimated_monthly_payment: 0 });
const sample = (): Entry[] => [
    ['Savings account', 'Cash', 'USD', 8500], ['AAPL', 'Stock', 'USD', 225, 20, 190], ['Bitcoin', 'Crypto', 'USD', 60000, .08, 52000], ['Term deposit', 'Deposit', 'UZS', 50000000], ['Apartment mortgage', 'Mortgage', 'USD', 18000], ['Loan to a friend', 'Money lent', 'USD', 1200], ['Monthly salary', 'Salary', 'UZS', 18000000], ['Apartment rent', 'Rent expense', 'UZS', 4500000], ['Groceries & everyday', 'Living expense', 'UZS', 2000000]
].map((a, i) => ({ ...fresh(), name: String(a[0]), kind: a[1] as Entry['kind'], currency: a[2] as Entry['currency'], amount: Number(a[3]), quantity: Number(a[4] ?? 1), cost: Number(a[5] ?? 0), frequency: i >= 6 ? 'Monthly' : 'Once' }));
const sections = [['Overview', LayoutDashboard, '/'], ['Assets & investments', ChartNoAxesCombined, '/assets'], ['Income & expenses', ArrowDownLeft, '/income-expenses'], ['Loans & debts', HandCoins, '/loans-debts'], ['Settings', Settings, '/settings']] as const;
export default function FinanceWorkspace() {
    return <LanguageProvider><WorkspaceContent /></LanguageProvider>;
}

function WorkspaceContent() {
    const pathname = usePathname();
    const section = sections.find(([, , path]) => path === pathname)?.[0] || 'Overview';
    const { t, locale, setDefaultLanguage, setLanguage } = useLanguage();
    const formatDate = (value: string) => sharedFormatDate(value, locale);
    const preferences = <div className="preferences"><LanguageSelector /><ThemeToggle /></div>;
    const [user, setUser] = useState<string | null>(null), [ready, setReady] = useState(false), [configured, setConfigured] = useState(true), [demo, setDemo] = useState(false), [rows, setRows] = useState<Entry[]>([]), [currency, setCurrency] = useState<string>('USD'), [editing, setEditing] = useState<Entry | null>(null), [deleting, setDeleting] = useState<Entry | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
    const [preferencesData, setPreferencesData] = useState<Preferences>(defaultPreferences);
    const [settingsLoading, setSettingsLoading] = useState(false);
    const [settingsError, setSettingsError] = useState('');
    function applyPreferences(next: Preferences) { setPreferencesData(next); if (demo) setLanguage(next.language); else setDefaultLanguage(next.language); setCurrency(next.currencies[0]); }
    useEffect(() => {
        if (!user || demo) return;
        const controller = new AbortController(); setSettingsLoading(true); setSettingsError('');
        fetch('/api/settings', { signal: controller.signal }).then(async response => {
            const data = await response.json() as Preferences & { error?: string };
            if (!response.ok) throw Error(data.error);
            if (!controller.signal.aborted) applyPreferences(data);
        }).catch(error => { if (!controller.signal.aborted) setSettingsError(error.message); }).finally(() => { if (!controller.signal.aborted) setSettingsLoading(false); });
        return () => controller.abort();
    }, [user, demo]);
    const [tracking, setTracking] = useState<Entry | null>(null);
    const [payingMortgage, setPayingMortgage] = useState<Entry | null>(null);
    async function recordMortgagePayment(payment: MortgagePayment) {
        if (demo) {
            setRows(previous => {
                if (previous.some(row => row.id === payment.id)) return previous;
                const mortgage = previous.find(row => row.id === payment.mortgage_id)!;
                return [...previous.map(row => row.id === mortgage.id ? { ...row, amount: row.amount - payment.principal } : row), { ...fresh(), id: payment.id, name: mortgage.name, kind: 'Other expense', currency: mortgage.currency, amount: payment.principal + payment.interest, date: payment.date, notes: payment.notes, mortgage_payment_id: payment.id, payment_principal: payment.principal, payment_interest: payment.interest }];
            });
        } else {
            const response = await fetch('/api/mortgage-payments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payment) });
            const result = await response.json() as { error?: string };
            if (!response.ok) throw new Error(result.error || 'Payment could not be confirmed. Retry with the same details.');
            refreshRecords();
        }
    }
    const [businesses, setBusinesses] = useState<Array<{ id: string; name: string }>>([]);
    const [summary, setSummary] = useState<Entry[]>([]);
    const [recordTotal, setRecordTotal] = useState(0);
    const [pageState, setPageState] = useState({ key: '', page: 1 });
    const [recordsLoading, setRecordsLoading] = useState(false);
    const [loadedKey, setLoadedKey] = useState('');
    const [reload, setReload] = useState(0);
    const summaryLoaded = useRef(false);
    const [recordKinds, setRecordKinds] = useState<readonly string[]>(kinds);
    const { market, loading: marketLoading, error: marketError, refresh } = useMarket(demo ? rows : summary, !!user || demo);
    const [fetchingPrice, setFetchingPrice] = useState(false);
    const [priceMessage, setPriceMessage] = useState('');
    useEffect(() => { setPriceMessage(''); }, [editing?.id, editing?.name, editing?.currency]);
    async function fetchPrice() {
        if (!editing) return;
        const target = editing, instrument = instrumentFor(target);
        if (!instrument) return;
        setFetchingPrice(true); setPriceMessage('');
        try {
            const data = await fetchMarket([target]);
            const quote = data.quotes[instrumentKey(instrument)];
            if (!quote) throw Error(data.errors[instrumentKey(instrument)] || 'Price unavailable. Saved price is shown.');
            const amount = convertAmount(quote.usd, 'USD', target.currency, (data.rates ?? data.fx?.rate));
            if (amount === null) throw Error('Exchange rate unavailable.');
            setEditing(current => current?.id === target.id && current.name === target.name && current.currency === target.currency && current.kind === target.kind ? { ...current, amount } : current);
        } catch (error) { setPriceMessage((error as Error).message); }
        finally { setFetchingPrice(false); }
    }
    const quoteLabel = (entry: Entry) => {
        const instrument = instrumentFor(entry), quote = instrument && market?.quotes[instrumentKey(instrument)];
        if (!instrument) return t('Select a coin or enter a stock ticker to fetch prices.');
        if (!quote || convertAmount(quote.usd, 'USD', currency, market?.rates ?? market?.fx?.rate) === null) return t(market?.errors[instrumentKey(instrument)] || 'Saved price');
        const time = formatDateTime(quote.marketTime || quote.fetchedAt, locale);
        return t(quote.marketTime ? '{source} · Quote: {time}' : '{source} · Checked: {time}', { source: quote.source, time });
    };
    const money = (n: number, c = currency) => formatMoney(n, c, locale);
    const sectionKey = section === 'Assets & investments' ? 'assets' : section === 'Income & expenses' ? 'cashflow' : section === 'Loans & debts' ? 'debts' : 'all';
    const currencyFilter = market?.rates?.[currency] ? '' : currency;
    const paginationKey = sectionKey + ':' + currencyFilter;
    const page = pageState.key === paginationKey ? pageState.page : 1;
    const requestKey = paginationKey + ':' + page;
    const refreshRecords = () => { summaryLoaded.current = false; setReload(n => n + 1); };
    const expensePlans = useExpensePlans(user, demo, rows, reload, refreshRecords);
    useEffect(() => {
        if (!user || demo || section === 'Settings') return;
        const controller = new AbortController();
        setRecordsLoading(true);
        const params = new URLSearchParams({ page: String(page), section: sectionKey, summary: summaryLoaded.current ? '0' : '1' });
        if (currencyFilter) params.set('currency', currencyFilter);
        fetch('/api/records?' + params, { signal: controller.signal }).then(async response => {
            const data = await response.json() as { error?: string; records: Entry[]; total: number; page: number; summary?: Entry[]; businesses?: Array<{ id: string; name: string }> };
            if (!response.ok) throw Error(data.error);
            if (controller.signal.aborted) return;
            const normalize = (e: Entry): Entry => ({ ...e, date: e.date ?? '', lent_date: e.lent_date ?? '', amount: Number(e.amount), quantity: Number(e.quantity), cost: Number(e.cost), rate: Number(e.rate), ownership_percentage: Number(e.ownership_percentage ?? 100), estimated_monthly_income: Number(e.estimated_monthly_income ?? 0), estimated_monthly_payment: Number(e.estimated_monthly_payment ?? 0) });
            setRows(data.records.map(normalize)); setRecordTotal(data.total);
            if (data.summary) { setSummary(data.summary.map(normalize)); setBusinesses(data.businesses || []); summaryLoaded.current = true; }
            setLoadedKey(paginationKey + ':' + data.page);
            if (data.page !== page) setPageState({ key: paginationKey, page: data.page });
        }).catch(error => { if (!controller.signal.aborted) { setError(error.message); setRows([]); setRecordTotal(0); setLoadedKey(requestKey); } })
          .finally(() => { if (!controller.signal.aborted) setRecordsLoading(false); });
        return () => controller.abort();
    }, [user, demo, page, section, sectionKey, currencyFilter, reload]);
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

    } }).catch(e => setError(e.message)).finally(() => setReady(true)); }, []);
    useEffect(() => { const ctx = (document as unknown as {
        modelContext?: {
            registerTool: (t: unknown, o: unknown) => void;
        };
    }).modelContext; if (!ctx)
        return; const controller = new AbortController(); try {
        ctx.registerTool({ name: 'start_finance_record', description: 'Open the finance record form. Does not save a record.', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: false }, execute: (input: unknown) => { if (!input || typeof input !== 'object' || Object.keys(input).length)
                throw Error('No fields accepted.'); if (!user && !demo)
                throw Error('Sign in first.'); setRecordKinds(kinds); setEditing(fresh()); return { status: 'form_opened' }; } }, { signal: controller.signal });
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

    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    async function save(e: React.FormEvent) { e.preventDefault(); if (!editing)
        return; if ((editing.kind === 'Money lent' && (!editing.lent_date || (editing.date && editing.date < editing.lent_date))) || (editing.kind !== 'Money lent' && !editing.date)) { setError('Check the record fields.'); return; } setBusy(true); setError(''); try {
        if (editing.expense_plan_id) {
            const plan = expensePlans.plans.find(p => p.id === editing.expense_plan_id);
            if (!plan || editing.currency !== plan.currency || editing.frequency !== 'Once' || !expenses.includes(editing.kind) || editing.business_id || editing.date < plan.start_date || (plan.end_date && editing.date > plan.end_date)) throw Error('Check the expense plan, currency and spending date.');
        }
        if (!demo) {
            const r = await fetch('/api/records', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editing) });
            if (!r.ok)
                throw Error((await r.json() as {
                    error: string;
                }).error);
        }
        if (demo) setRows(prev => [editing, ...prev.filter(r => r.id !== editing.id)]);
        else refreshRecords();
        setEditing(null);
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    async function remove() { if (!deleting)
        return; if (demo && deleting.kind === 'Business' && rows.some(r => r.business_id === deleting.id)) { setError('This business has linked records. Unlink them before deleting or changing its category.'); return; } setBusy(true); setError(''); try {
        if (!demo) {
            const r = await fetch('/api/records', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: deleting.id }) });
            if (!r.ok)
                throw Error((await r.json() as {
                    error: string;
                }).error);
        }
        if (demo) setRows(prev => prev.filter(r => r.id !== deleting.id));
        else refreshRecords();
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
    } setUser(null); setDemo(false); setRows([]); setSummary([]); setBusinesses([]); setRecordTotal(0); setPreferencesData(defaultPreferences); setCurrency('USD'); summaryLoaded.current = false; setError(''); }
    const brand = <div className="brand"><span className="mark">h.</span><span>HOGGISH<small className="block">{t("PERSONAL FINANCE")}</small></span></div>;
    if (!ready)
        return <main className="session-loading" aria-busy="true">{brand}<p className="muted" role="status">{t("Loading your workspace…")}</p></main>;
    if (!user && !demo)
        return <main className="login"><section className="intro">{brand}<div><p className="eyebrow">{t("YOUR MONEY. THE WHOLE PICTURE.")}</p><h1>{t("A clear view.")}<br />{t("A stronger future.")}</h1><p className="lede">{t("From your next payday to your long-term investments.")}<br />{t("Keep your financial life in one place.")}</p><div className="feature-row"><Wallet /><span>USD & UZS</span><ChartNoAxesCombined /><span>{t("Assets & investments")}</span></div></div><p className="muted">{t("Personal finance, thoughtfully organized.")}</p></section><section className="login-panel"><div className="login-preferences">{preferences}</div><div className="login-box"><ShieldCheck className="login-icon"/><p className="eyebrow">{t("YOUR PRIVATE WORKSPACE")}</p><h2>{t("Welcome back.")}</h2><p className="muted">{t("Sign in to your financial overview.")}</p><form action="/api/auth/google" method="post" className="google-form"><Button type="submit" variant="outline" className="google-button" disabled={busy || !ready || !configured}>{t("Continue with Google")}</Button></form><div className="login-divider"><span>{t("or sign in with email")}</span></div><form onSubmit={login}><label>{t("Email address")}<Input name="email" type="email" placeholder="you@example.com" required autoComplete="username"/></label><label>{t("Password")}<Input name="password" type="password" placeholder={t("Enter your password")} required autoComplete="current-password"/></label><Button className="primary" disabled={busy || !ready || !configured}>{busy ? t("Signing in…") : t("Sign in")} <ArrowUpRight size={18}/></Button></form>{error && <p className="error" role="alert">{t(error)}</p>}{ready && !configured && <p className="setup-note">{t("Account connection is awaiting setup. You can explore the sample workspace below.")}</p>}<Button variant="ghost" className="demo-button" onClick={() => { setRows(sample()); setDemo(true); setError(''); }}>{t("Explore sample workspace")} <ChevronRight size={16}/></Button><p className="login-note">{t("Access is by invitation. Your administrator creates your account.")}</p></div></section></main>;
    const convertedPlanExpenses = expensePlans.plans.map(plan => convertAmount(expensePlanTotals(plan, expensePlans.month).projected, plan.currency, currency, market?.rates ?? market?.fx?.rate));
    const planProjection = convertedPlanExpenses.reduce<number>((sum, amount) => sum + (amount ?? 0), 0);
    const forecastReady = !expensePlans.loading && !expensePlans.error;
    const current = (demo ? rows : summary).map(r => marketEntry(r, currency, market)).filter((r): r is Entry => r !== null), sum = (types: readonly string[]) => current.filter(r => types.includes(r.kind)).reduce((n, r) => n + value(r), 0), totalAssets = sum(assets), totalDebt = sum(liabilities), monthlyIncome = current.filter(r => income.includes(r.kind)).reduce((n, r) => n + monthly(r), 0), monthlyExpense = current.filter(r => expenses.includes(r.kind) && !r.expense_plan_id).reduce((n, r) => n + monthly(r), planProjection);
    const forecast = estimatedCashFlow(current, planProjection);
    const sortRecords = (entries: Entry[]) => [...entries].sort((a,b) => (b.kind === 'Money lent' ? b.lent_date || b.date : b.date).localeCompare(a.kind === 'Money lent' ? a.lent_date || a.date : a.date) || b.id.localeCompare(a.id));
    const demoVisible = sortRecords(current.filter(r => section === 'Overview' || (section === 'Assets & investments' ? assetRecordKinds : section === 'Loans & debts' ? lendingRecordKinds : [...income, ...expenses]).includes(r.kind)));
    const totalRecords = demo ? demoVisible.length : recordTotal;
    const pageCount = Math.max(1, Math.ceil(totalRecords / 10));
    const tableLoading = !demo && (recordsLoading || loadedKey !== requestKey);
    const visible = demo ? demoVisible.slice((page - 1) * 10, page * 10) : tableLoading ? [] : rows.map(r => marketEntry(r, currency, market) ?? r);

    const allocation = assets.map(k => ({ kind: k, total: sum([k]) })).filter(x => x.total > 0);
    const cashFlowSection = section === 'Income & expenses';
    const availableBusinesses = demo ? rows.filter(r => r.kind === 'Business') : businesses;
    const editingCashFlow = !!editing && [...income, ...expenses].includes(editing.kind);
    const linkedExpensePlan = expensePlans.plans.find(plan => plan.id === editing?.expense_plan_id);
    const spendFromPlan = (plan: ExpensePlan) => {
        setError(''); setRecordKinds(expenses);
        const date = depositToday() < plan.start_date ? plan.start_date : plan.end_date && depositToday() > plan.end_date ? plan.end_date : depositToday();
        setEditing({ ...fresh(), name: plan.name, kind: plan.category === 'Groceries' || plan.category === 'Household' ? 'Living expense' : 'Other expense', currency: plan.currency, frequency: 'Once', expense_plan_id: plan.id, date });
    };

    const addCashFlow = (kind: Entry['kind']) => { setError(''); setRecordKinds(income.includes(kind) ? income : expenses); setEditing({ ...fresh(), currency, kind, frequency: 'Monthly' }); };
    const addRecord = () => {
        if (cashFlowSection) { addCashFlow('Other expense'); return; }
        setError('');
        setRecordKinds(section === 'Assets & investments' ? assetRecordKinds : section === 'Loans & debts' ? lendingRecordKinds : kinds);
        setEditing({ ...fresh(), currency, kind: section === 'Loans & debts' ? 'Mortgage' : 'Cash' });
    };
    const editRecord = (record: Entry) => {
        setError('');
        setRecordKinds(income.includes(record.kind) ? income : expenses.includes(record.kind) ? expenses : assetRecordKinds.includes(record.kind) ? assetRecordKinds : lendingRecordKinds);
        setEditing({ ...(rows.find(r => r.id === record.id) || record) });
    };
    const field = (key: keyof Entry, v: string | number) => setEditing(p => p ? { ...p, [key]: v } : p);
    return <SidebarProvider><Sidebar><SidebarHeader className="p-6">{brand}</SidebarHeader><SidebarContent className="px-4 pt-8"><p className="nav-label">{t("WORKSPACE")}</p><SidebarMenu>{sections.map(([name, Icon, path]) => <SidebarMenuItem key={name}><SidebarMenuButton asChild className="nav-item" isActive={section === name}><Link href={path} aria-current={section === name ? 'page' : undefined}><Icon /><span>{t(name)}</span></Link></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu><div className="sidebar-card"><ShieldCheck size={23}/><strong>{t("Your money, your space.")}</strong><p>{demo ? t("Explore with sample data. Changes last until you leave this workspace.") : t("Your records are private to your account.")}</p></div></SidebarContent><SidebarFooter className="p-5"><div className="user-line"><span className="avatar">{demo ? 'D' : user?.slice(0, 1).toUpperCase()}</span><div><strong>{demo ? t("Demo workspace") : t("Personal account")}</strong><p>{demo ? t("Sample data") : user}</p></div></div><Button variant="ghost" onClick={logout}><LogOut size={16}/>{demo ? t("Exit demo") : t("Sign out")}</Button></SidebarFooter></Sidebar><main className="workspace"><header className="topbar"><div className="flex items-center gap-3"><SidebarTrigger aria-label={t('Toggle Sidebar')}/><span>{t("My workspace")}</span><ChevronRight size={14}/><span className="muted">{t(section)}</span></div>{preferences}</header><div className={section === 'Overview' ? 'content overview-content' : 'content'}>{section === 'Settings' ? <SettingsPanel key={String(user) + settingsLoading} initial={preferencesData} demo={demo} onSaved={applyPreferences} loading={settingsLoading} loadError={settingsError}/> : <>{demo && <div className="demo-banner"><span>{t("DEMO MODE")}</span> {t("Sample balances · Changes are not saved to an account.")}</div>}<div className="page-heading"><div><h1>{section === 'Overview' ? t("Your money at a glance.") : t(section)}</h1><p className="muted">{section === 'Overview' ? t("Everything you own, earn, and owe. In one place.") : cashFlowSection ? t("Plan recurring income and expenses, or add a one-time entry.") : t("Manage your records and keep your balances up to date.")}</p></div>{section !== 'Overview' && <div className="entry-actions">{cashFlowSection ? <><Button variant="outline" onClick={() => addCashFlow('Other income')}><Plus size={18}/>{t("Add income")}</Button><Button className="primary" onClick={() => addCashFlow('Other expense')}><Plus size={18}/>{t("Add expense")}</Button></> : <Button className="primary" onClick={addRecord}><Plus size={18}/>{t("Add record")}</Button>}</div>}</div><div className="workspace-controls"><div className="currency-bar"><div className="currency-switch" aria-label={t("Display currency")}>{preferencesData.currencies.map(c => <button key={c} aria-pressed={currency === c} className={currency === c ? 'selected' : ''} onClick={() => setCurrency(c)}>{c === 'USD' ? '$ USD' : c}</button>)}</div><span>{t('Balances converted to {currency}.', { currency })}</span></div><div className="market-bar"><span>{market?.ratesDate && currency !== 'UZS' ? t('Daily exchange rates · {date}', { date: formatDate(market.ratesDate) }) : market?.fx ? t('1 USD = {rate} UZS · CBU · {date}', { rate: formatNumber(market.fx.rate, locale), date: formatDate(market.fx.date) }) : t(marketLoading ? 'Fetching prices…' : 'Exchange rate unavailable. Only records in the selected currency are included.')}</span><Button variant="outline" size="sm" disabled={marketLoading} onClick={refresh}>{t(marketLoading ? 'Fetching prices…' : 'Refresh prices')}</Button></div>{market?.ratesDate && <p className="fx-attribution"><a href="https://www.exchangerate-api.com" target="_blank" rel="noreferrer">Rates By Exchange Rate API</a> · {formatDate(market.ratesDate)}</p>}</div>{(demo ? rows : summary).some(r => marketEntry(r, currency, market) === null) && <p className="muted">{t('Some currencies could not be converted and are excluded from totals.')}</p>}{marketError && <p role="status" className="muted">{t(marketError)}</p>}{!cashFlowSection && expensePlans.error && <p role="alert" className="error">{t(expensePlans.error)} <Button variant="outline" onClick={refreshRecords}>{t('Retry')}</Button></p>}{convertedPlanExpenses.some(amount => amount === null) && <p className="muted">{t('Some expense plans could not be converted and are excluded from the forecast.')}</p>}{error && <div className="error" role="alert">{t(error)}</div>}{cashFlowSection ? <div className="metrics recurring-metrics"><article><p>{t("Estimated monthly income")}</p><h2 className="positive">{money(forecast.plannedIncome)}</h2><small>{t("Includes asset estimates; linked business income counted once.")}</small></article><article><p>{t("Estimated monthly expenses")}</p><h2>{forecastReady ? money(forecast.monthlyExpenses + forecast.mortgagePayments) : '—'}</h2><small>{t("Recurring expenses, monthly plans and estimated mortgage payments")}</small></article><article><p>{t("Estimated monthly cash flow")}</p><h2 className={forecast.forecast >= 0 ? 'positive' : 'negative'}>{forecastReady ? money(forecast.forecast) : '—'}</h2><small>{t("One-time entries are excluded")}</small></article></div> : <div className="metrics"><article className="net-worth"><p>{t("NET WORTH")} <Wallet size={18}/></p><h2>{money(totalAssets - totalDebt)}</h2><small>{t("Assets minus outstanding debt")}</small><div className="net-line"/></article><article><p>{t("Total assets")} <Landmark size={18}/></p><h2>{money(totalAssets)}</h2><small>{t('Assets in {currency}: {count}', { currency, count: current.filter(r => assets.includes(r.kind)).reduce((n,r) => n + (r.record_count ?? 1), 0) })}</small></article><article><p>{t("Outstanding debt")} <HandCoins size={18}/></p><h2>{money(totalDebt)}</h2><small>{t("Mortgages, loans & other debts")}</small></article><article><p>{t("Estimated monthly cash flow")} <ArrowUpRight size={18}/></p><h2 className={forecast.forecast >= 0 ? 'positive' : 'negative'}>{forecastReady ? money(forecast.forecast) : '—'}</h2><small>{t("Income estimates minus expenses and mortgage payments")}</small></article></div>}{(forecast.estimatedIncome > 0 || forecast.mortgagePayments > 0) && (section === 'Overview' || section === 'Assets & investments' || cashFlowSection || section === 'Loans & debts') && <section className="panel forecast-panel"><div><h2>{t('Estimated monthly cash flow')}</h2><p className="muted">{t('Asset income estimates plus other recurring income, minus recurring expenses and estimated mortgage payments. Linked business income is counted once.')}</p></div><div><strong>{forecastReady ? money(forecast.forecast) : '—'}</strong><small>{t('Estimated asset income: {amount}', { amount: money(forecast.estimatedIncome) })}</small><small>{t('Estimated mortgage payments: {amount}', { amount: money(forecast.mortgagePayments) })}</small></div></section>}{section === 'Assets & investments' && <AssetDistribution entries={current} currency={currency}/>}{section === 'Overview' && <div className="insights"><section className="panel"><div className="panel-title"><h2>{t("Asset allocation")}</h2><span>{t("Current balances")}</span></div>{allocation.length ? <><div className="allocation-bar">{allocation.map((a, i) => <div key={a.kind} style={{ width: `${a.total / totalAssets * 100}%`, background: categoryColor(a.kind) }}/>)}</div><div className="allocation-list">{allocation.map((a, i) => <div key={a.kind}><span><i style={{ background: categoryColor(a.kind) }}/>{t(a.kind)}</span><strong>{money(a.total)}</strong><span>{Math.round(a.total / totalAssets * 100)}%</span></div>)}</div></> : <div className="empty"><Landmark /><p>{t("Add your first asset to see its allocation.")}</p></div>}</section><section className="panel"><div className="panel-title"><h2>{t("Monthly commitments")}</h2><span>{t("Recurring and planned")}</span></div><div className="cash-row"><span className="icon-box"><ArrowDownLeft /></span><div><p>{t("Income")}</p><small>{t("Salary, rent received & more")}</small></div><strong className="positive">{money(monthlyIncome)}</strong></div><div className="cash-row"><span className="icon-box outgoing"><ArrowUpRight /></span><div><p>{t("Expenses")}</p><small>{t("Rent, living costs & more")}</small></div><strong>{forecastReady ? money(monthlyExpense) : '—'}</strong></div><div className="cash-row"><span className="icon-box outgoing"><Building2 /></span><div><p>{t("Estimated mortgage payments")}</p><small>{t("Principal and interest")}</small></div><strong>{money(forecast.mortgagePayments)}</strong></div><div className="cash-footer"><span>{t("Left after expenses")}</span><strong>{forecastReady ? money(monthlyIncome - monthlyExpense - forecast.mortgagePayments) : '—'}</strong></div><p className="footnote">{t("Yearly records are divided by 12. Linked plan spending is counted within its plan; other one-time records are excluded.")}</p></section></div>}{cashFlowSection && <EstimatedIncomeSources entries={forecast.estimatedAssets} currency={currency}/>}{cashFlowSection && <ExpensePlans {...expensePlans} currencies={preferencesData.currencies} onSpend={spendFromPlan} onRetry={refreshRecords}/>}<section className={section === 'Assets & investments' ? 'panel records compact-asset-records' : 'panel records'}><div className="panel-title"><h2>{section === 'Overview' ? t("All records") : t(section)} <span className="count">{formatNumber(totalRecords, locale, 0)}</span></h2><span>{t("Fetched prices where available")}</span></div>{tableLoading ? <div className="empty" role="status">{t("Loading records…")}</div> : visible.length ? <div className="table-scroll"><table><thead><tr><th>{t("Name")}</th><th>{t("Category")}</th><th>{cashFlowSection ? t("Start / record date") : t("Date / due date")}</th>{cashFlowSection && <th>{t("Repeats")}</th>}<th>{cashFlowSection ? t("Amount per occurrence") : t("Value")}</th><th>{t("Actions")}</th></tr></thead><tbody>{visible.map(r => <tr key={r.id}><td><div className="record-name"><span className="record-icon">{r.kind === 'Crypto' ? <Bitcoin /> : r.kind === 'Property' || r.kind === 'Mortgage' ? <Building2 /> : <Wallet />}</span><div><strong>{r.name}</strong>{r.kind === 'Mortgage' && (r.estimated_monthly_payment ?? 0) > 0 && <small>{t("Estimated payment: {amount}/month", { amount: money(r.estimated_monthly_payment!, r.currency) })}</small>}{r.expense_plan_id && <small>{t('Expense plan: {name}', { name: expensePlans.plans.find(plan => plan.id === r.expense_plan_id)?.name || r.name })}</small>}{r.mortgage_payment_id && <small>{t("Mortgage payment · Principal: {principal} · Interest: {interest}", { principal: money(Number(r.payment_principal), r.currency), interest: money(Number(r.payment_interest), r.currency) })}</small>}{['Business', 'Property'].includes(r.kind) && (r.estimated_monthly_income ?? 0) > 0 && <small>{t("Estimated income: {amount}/month", { amount: money(r.estimated_monthly_income!, r.currency) })}</small>}{r.kind === 'Business' && <small>{t("Ownership: {percentage}%", { percentage: formatNumber(r.ownership_percentage ?? 100, locale) })}</small>}{r.business_id && <small>{t("Business: {name}", { name: availableBusinesses.find(b => b.id === r.business_id)?.name || t("Business") })}</small>}{!(section === 'Assets & investments' && !['Stock', 'Crypto'].includes(r.kind) && r.frequency === 'Once' && !r.rate && !r.notes) && <small>{['Stock', 'Crypto'].includes(r.kind) ? t('{quantity} units · Gain/loss {amount}', { quantity: formatNumber(r.quantity, locale), amount: money((r.amount - r.cost) * r.quantity, r.currency) }) : r.frequency === 'Once' ? (r.rate ? t('{rate}% annual interest', { rate: formatNumber(r.rate, locale) }) : r.notes || t("One-time record")) : t(r.frequency)}</small>}{['Stock', 'Crypto'].includes(r.kind) && <><small>{t('{price} per unit', { price: formatMoney(r.amount, r.currency, locale, true) })}</small><small>{quoteLabel(r)}</small></>}</div></div></td><td><CategoryBadge kind={r.kind} label={t(r.kind)}/></td><td className="muted">{r.kind === 'Money lent' ? <><div>{t("Lent: {date}", { date: formatDate(r.lent_date || '') })}</div><small>{r.date ? t("Due: {date}", { date: formatDate(r.date) }) : t("No due date")}</small></> : formatDate(r.date)}</td>{cashFlowSection && <td><span className="badge">{r.frequency === 'Once' ? t("One time") : r.frequency === 'Monthly' ? t("Every month") : t("Every year")}</span></td>}<td className="amount">{money(value(r), r.currency)}</td><td><div className="row-actions">{!demo && trackedKinds.includes(r.kind) && <Button size="sm" variant="outline" onClick={() => setTracking(rows.find(row => row.id === r.id) || r)}>{t("Tracker")}</Button>}{r.kind === 'Mortgage' && <Button size="sm" variant="outline" onClick={() => setPayingMortgage(rows.find(row => row.id === r.id) || r)}>{t("Record payment")}</Button>}{!r.mortgage_payment_id && !r.history_event_id && <><Button size="icon" variant="ghost" aria-label={t('Edit {name}', { name: r.name })} onClick={() => editRecord(r)}><Pencil size={15}/></Button><Button size="icon" variant="ghost" aria-label={t('Delete {name}', { name: r.name })} onClick={() => setDeleting(r)}><Trash2 size={15}/></Button></>}</div></td></tr>)}</tbody></table></div> : <div className="empty"><Wallet /><h3>{t("A fresh start.")}</h3><p>{t('Add a record in {currency} to start building your overview.', { currency })}</p>{section !== 'Overview' && <Button variant="outline" onClick={addRecord}><Plus />{cashFlowSection ? t("Add your first expense") : t("Add your first record")}</Button>}</div>}<nav className="records-pagination" aria-label={t('Record pages')}><span>{t('Page {page} of {pages} · {count} records', { page: formatNumber(page, locale, 0), pages: formatNumber(pageCount, locale, 0), count: formatNumber(totalRecords, locale, 0) })}</span><div><Button variant="outline" disabled={tableLoading || busy || page <= 1} onClick={() => setPageState({ key: paginationKey, page: page - 1 })}>{t('Previous')}</Button><Button variant="outline" disabled={tableLoading || busy || page >= pageCount} onClick={() => setPageState({ key: paginationKey, page: page + 1 })}>{t('Next')}</Button></div></nav></section><p className="bottom-note"><ShieldCheck size={14}/>{demo ? t("Sample data for exploring the app.") : t("Private records · Only visible to your account.")}</p></>}</div></main>
 <Dialog open={!!editing} onOpenChange={open => { if (!open && !busy)
        setEditing(null); }}><DialogContent className="record-dialog" showCloseButton={false}><DialogClose className="absolute top-4 right-4" aria-label={t('Close')} disabled={busy}><X size={18}/></DialogClose><DialogTitle>{rows.some(r => r.id === editing?.id) ? t("Edit record") : editingCashFlow ? (income.includes(editing!.kind) ? t("Add income") : t("Add expense")) : editing?.kind === 'Money lent' ? t("Add money lent") : t("Add a record")}</DialogTitle><DialogDescription>{editing?.kind === 'Money lent' ? t("Keep track of who owes you, how much, and when.") : editingCashFlow ? t("Enter an amount and choose how often it repeats.") : (recordKinds === assets || recordKinds === liabilities ? t("Keep a current balance for this record.") : t("Keep a current balance or record income and expenses."))}</DialogDescription>{editing && <form className="record-form" onSubmit={save}>{editing.kind === 'Crypto' ? <label>{t('Coin')}<NativeSelect value={coins.find(c => c[0] === instrumentFor(editing)?.symbol) ? coinName(coins.find(c => c[0] === instrumentFor(editing)?.symbol)!) : ''} required onChange={e => setEditing({ ...editing, name: e.target.value, amount: 0 })}><option value="">{t('Select a coin')}</option>{coins.map(c => <option key={c[0]} value={coinName(c)}>{coinName(c)}</option>)}</NativeSelect></label> : editing.kind === 'Stock' ? <label>{t('Stock ticker (USD-listed)')}<Input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value.toUpperCase().trim(), amount: 0 })} placeholder="AAPL" pattern="[A-Z][A-Z0-9.\-]{0,14}" maxLength={15} required /></label> : <RecordNameInput label={editing.kind === 'Money lent' ? t("Borrower name") : undefined} entry={editing} original={rows.find(r => r.id === editing.id)} rows={demo ? rows : summary} onChange={name => field('name', name)} placeholder={editingCashFlow ? (income.includes(editing.kind) ? t("e.g. Monthly salary") : t("e.g. Rent or internet subscription")) : editing.kind === 'Money lent' ? t("e.g. Full name") : editing.kind === 'Business' ? t("e.g. Solar panels, café, or game club") : t("e.g. Savings account")}/>}<div className="form-grid"><label>{t("Category")}<NativeSelect value={editing.kind} onChange={e => setEditing({ ...editing, kind: e.target.value as Entry['kind'], amount: 0, expense_plan_id: expenses.includes(e.target.value) ? editing.expense_plan_id : null, business_id: [...income, ...expenses].includes(e.target.value) ? editing.business_id : null, date: e.target.value === 'Money lent' ? '' : editing.date || today(), lent_date: editing.lent_date || today() })}>{recordKinds.map(k => <option key={k} value={k}>{t(k)}</option>)}</NativeSelect></label><label>{t("Currency")}<NativeSelect value={editing.currency} onChange={e => field('currency', e.target.value)}>{[...new Set(linkedExpensePlan ? [linkedExpensePlan.currency] : [...preferencesData.currencies, editing.currency])].map(code => <option key={code} value={code}>{currencyLabel(code, locale)}</option>)}</NativeSelect></label></div>{editingCashFlow && !editing.expense_plan_id && <label>{t('Linked business (optional)')}<NativeSelect value={editing.business_id || ''} onChange={event => setEditing({ ...editing, business_id: event.target.value || null })}><option value="">{t('No linked business')}</option>{availableBusinesses.map(business => <option key={business.id} value={business.id}>{business.name}</option>)}</NativeSelect></label>}{expenses.includes(editing.kind) && <label>{t('Monthly expense plan (optional)')}<NativeSelect disabled={expensePlans.loading || !!expensePlans.error} value={editing.expense_plan_id || ''} onChange={event => { const plan = expensePlans.plans.find(plan => plan.id === event.target.value); setEditing({ ...editing, expense_plan_id: plan?.id || null, ...(plan ? { currency: plan.currency, frequency: 'Once', business_id: null } : {}) }); }}><option value="">{t('No linked plan')}</option>{expensePlans.plans.map(plan => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</NativeSelect>{editing.expense_plan_id && <small className="muted">{t('This is actual spending within the plan, not an additional recurring expense.')}</small>}</label>}{editing.kind === 'Business' && <p className="muted">{t('Enter the full business value and your ownership percentage. Record your share of revenue and costs separately as linked income and expenses.')}</p>}<label className="record-amount">{['Stock', 'Crypto'].includes(editing.kind) ? t("Current price per unit") : editingCashFlow ? t("Amount per occurrence") : editing.kind === 'Money lent' ? t("Amount still owed") : editing.kind === 'Business' ? t("Full business value") : t("Amount / outstanding balance")}<FormattedNumberInput key={editing.id + ":amount"} value={editing.amount} max={1e15} onValueChange={value => field('amount', value)}/></label>{editing.kind === 'Mortgage' && <label>{t('Estimated monthly mortgage payment')}<FormattedNumberInput key={editing.id + ':payment-estimate'} value={editing.estimated_monthly_payment ?? 0} required={false} onValueChange={amount => field('estimated_monthly_payment', amount)}/><small className="muted">{t('Enter the expected total from your bank schedule, including principal and interest. Used for planning; recording payments is separate.')}</small></label>}{['Property', 'Business'].includes(editing.kind) && <label>{t('Estimated monthly income (your share)')}<FormattedNumberInput key={editing.id + ':estimate'} value={editing.estimated_monthly_income ?? 0} required={false} max={1e15} onValueChange={amount => field('estimated_monthly_income', amount)}/><small className="muted">{t('For planning only. Enter what you expect to receive each month; do not also add the same estimate as recurring income.')}</small></label>}{editing.kind === 'Business' && <><label>{t('Ownership (%)')}<FormattedNumberInput key={editing.id + ':ownership'} value={editing.ownership_percentage ?? 100} max={100} onValueChange={percentage => field('ownership_percentage', percentage)}/></label><p className="ownership-summary">{t('Your share: {amount}', { amount: money(value(editing), editing.currency) })}</p></>}{['Stock', 'Crypto'].includes(editing.kind) && <><Button type="button" variant="outline" disabled={fetchingPrice || !instrumentFor(editing)} onClick={fetchPrice}>{t(fetchingPrice ? 'Fetching prices…' : 'Fetch current price')}</Button>{priceMessage && <p role="status" className="muted">{t(priceMessage)}</p>}</>}{['Stock', 'Crypto'].includes(editing.kind) && <div className="form-grid"><label>{t("Quantity")}<FormattedNumberInput key={editing.id + ":quantity"} value={editing.quantity} max={1e12} onValueChange={value => field('quantity', value)}/></label><label>{t("Purchase price per unit")}<FormattedNumberInput key={editing.id + ":cost"} value={editing.cost} required={false} max={1e15} onValueChange={value => field('cost', value)}/></label></div>}{['Deposit', 'Money lent', ...liabilities].includes(editing.kind) && <label>{t("Annual interest rate (%)")}<FormattedNumberInput key={editing.id + ":rate"} value={editing.rate} required={false} max={1000} onValueChange={value => field('rate', value)}/></label>}{editing.kind === 'Deposit' && <p className="muted">{t('Use Deposit for an interest-bearing savings account. Enter an annual rate. Monthly interest is estimated from dated balances in Tracker; record withdrawals and top-ups there.')}</p>}<div className="form-grid">{editing.kind === 'Money lent' && <label>{t("Date lent")}<DatePicker value={editing.lent_date || ''} onChange={value => field('lent_date', value)}/></label>}<label>{editing.kind === 'Money lent' ? t("Due date (optional)") : ['Deposit', ...liabilities].includes(editing.kind) ? t("Due / maturity date") : editingCashFlow && editing.frequency !== 'Once' ? t("Start date") : t("Record date")}<DatePicker value={editing.date} required={editing.kind !== 'Money lent'} min={editing.kind === 'Money lent' ? editing.lent_date || undefined : linkedExpensePlan?.start_date} onChange={value => field('date', value)}/></label>{editingCashFlow && !editing.expense_plan_id && <label>{t("Repeats")}<NativeSelect value={editing.frequency} onChange={e => field('frequency', e.target.value)}><option value="Once">{t("One time")}</option><option value="Monthly">{t("Every month")}</option><option value="Yearly">{t("Every year")}</option></NativeSelect></label>}</div>{editingCashFlow && editing.frequency !== 'Once' && <p className="recurrence-help">{t('{amount} {frequency} from {date}. This is a recurring plan; it does not automatically create transactions or change account balances.', { amount: money(editing.amount, editing.currency), frequency: t(editing.frequency === 'Monthly' ? 'every month' : 'every year'), date: formatDate(editing.date) })}</p>}<label>{t("Notes (optional)")}<textarea value={editing.notes} maxLength={2000} rows={2} placeholder={t("Account, lender, borrower, or other details")} onChange={e => field('notes', e.target.value)}/></label>{error && <p role="alert" className="error">{t(error)}</p>}<div className="record-form-footer"><Button type="button" variant="outline" disabled={busy} onClick={() => setEditing(null)}>{t("Cancel")}</Button><Button className="primary" disabled={busy}>{busy ? t("Saving…") : demo ? t("Save in demo") : t("Save record")}</Button></div></form>}</DialogContent></Dialog>
 {tracking && <InvestmentTracker key={tracking.id} record={tracking} onClose={() => setTracking(null)} onSaved={refreshRecords} onPayment={() => { setPayingMortgage(rows.find(row => row.id === tracking.id) || tracking); setTracking(null); }}/>}
 {payingMortgage && <MortgagePaymentDialog key={payingMortgage.id} mortgage={payingMortgage} onClose={() => setPayingMortgage(null)} onSave={recordMortgagePayment}/>}
 <AlertDialog open={!!deleting} onOpenChange={o => { if (!o && !busy)
        setDeleting(null); }}><AlertDialogContent><AlertDialogTitle>{t("Delete this record?")}</AlertDialogTitle><AlertDialogDescription>{t('{name} will be permanently removed.', { name: deleting?.name ?? '' })}</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel disabled={busy}>{t("Keep record")}</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={e => { e.preventDefault(); void remove(); }}>{t("Delete record")}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></SidebarProvider>;
}
