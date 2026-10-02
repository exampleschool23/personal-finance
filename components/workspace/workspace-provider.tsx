"use client";
import { createContext, useContext, useEffect, useState, useRef, useEffectEvent, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { showSaved, showError } from '@/lib/feedback';
import { decimalSum } from '@/lib/decimal-amounts';
import { demoMarket, type DemoWorkspace } from '@/lib/demo-finance';
import { useOwnerResource } from '@/hooks/use-owner-resource';
import { applyRecordChange } from '@/lib/record-balance';
import { refreshRead } from '@/lib/refresh-read';
import { requiresCashAccount, cashFlowAmountMissing } from '@/lib/cash-account-required';
import { useWorkspacePreferences } from '@/hooks/use-workspace-preferences';
import { useRecordFilters } from '@/hooks/use-record-filters';
import { useTransactionTools } from '@/hooks/use-transaction-tools';
import { activeFilterCount, filterRecords, recordsRequestKey, type RecordFiltersValue } from '@/lib/record-filters';
import { isTransactionHistory } from '@/lib/transaction-history';
import type { HoldingAccount } from '@/lib/holding-accounts';
import { usePlanning } from '@/hooks/use-planning';
import { upcomingPayments } from '@/lib/planning';
import type { DeletedItem } from '@/lib/deleted-items';
import { useLanguage } from '@/components/language-provider';
import { formatMoney, formatDateTime } from '@/lib/format';
import { useExpensePlans } from '@/hooks/use-expense-plans';
import { expensePlanMonth, monthlyBudgetTotals, type ExpensePlan } from '@/lib/expense-plans';
import { depositToday } from '@/lib/deposit-interest';
import { useEarningSources } from '@/hooks/use-earning-sources';
import { withAssetIncomePlans, legacyEarningSources, sourceSchedule, selectEarningSource, resolveEarningSource, type EarningSource } from '@/lib/earning-sources';
import { resolveIncomeSource } from '@/lib/income-sources';
import { defaultPreferences, type Preferences } from '@/lib/currencies';
import { needsOnboarding } from '@/lib/onboarding';
import { saveTrackingStartRequest } from '@/hooks/use-comparison-profile';
import { applyFont, resolveFont } from '@/lib/fonts';
import type { MortgagePayment } from '@/components/mortgage-payment-dialog';
import { instrumentFor, instrumentKey, convertAmount, marketEntry } from '@/lib/market';
import { usePortfolioSnapshots } from '@/hooks/use-portfolio-snapshots';
import { useMarket, fetchMarket } from '@/hooks/use-market';
import { compareRecordDates } from '@/lib/record-dates';
import { sortAssetsByWorth } from '@/lib/asset-sort';
import { type Entry, normalizeEntry, kinds, assets, liabilities, assetRecordKinds, lendingRecordKinds, income, expenses, financialTotals, estimatedCashFlow } from '@/lib/finance';
import { sectionFor } from '@/components/workspace/navigation';
import { signInPath } from '@/lib/sign-in-path';
import { recategorize, type CategoryChoice } from '@/lib/transaction-rules';
import { assignBusiness, businessesIn, isBusinessAccount, moveAccountToBusiness } from '@/lib/business';
import { orderedGoals as orderById } from '@/lib/goal-order';
import { savedOrder } from '@/lib/workspace-preferences';
import { useTags } from '@/hooks/use-tags';
import { useRecordAttachments } from '@/hooks/use-record-attachments';
import { emptyTags, type TagData } from '@/lib/tags';

const today = depositToday;
const fresh = (): Entry => ({ id: crypto.randomUUID(), name: '', kind: 'Cash', currency: 'USD', amount: 0, quantity: 1, cost: 0, rate: 0, date: today(), lent_date: today(), frequency: 'Once', notes: '', business_id: null, ownership_percentage: 100, estimated_monthly_income: 0, estimated_monthly_payment: 0 });
const emptyHistoryPage={records:[] as Entry[],total:0,page:1};

/** Session, records and actions shared by the drawer, the top bar, the dialogs and every screen. */
function useWorkspaceState() {
    const pathname = usePathname();
    const router = useRouter();
    const section = sectionFor(pathname);
    const { t, locale, language, setDefaultLanguage, setLanguage } = useLanguage();
    const [user, setUser] = useState<string | null>(null), [ready, setReady] = useState(false), [configured, setConfigured] = useState(true), [demo, setDemo] = useState(false), [rows, setRows] = useState<Entry[]>([]), [currency, setCurrency] = useState<string>('USD'), [editing, setEditing] = useState<Entry | null>(null), [deleting, setDeleting] = useState<Entry | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
    const [preferencesData, setPreferencesData] = useState<Preferences>(defaultPreferences);
    useEffect(() => {
        // Signed out, only the product tour and the sign-in page are open; signed in, the sign-in page has nothing to show.
        if (ready && (user || demo ? pathname === signInPath : pathname !== '/' && pathname !== signInPath)) router.replace('/');
    }, [ready, user, demo, pathname, router]);
    const [settingsLoading, setSettingsLoading] = useState(true);
    const [settingsError, setSettingsError] = useState('');
    const [settingsRevision,setSettingsRevision]=useState(0);
    const retrySettings=()=>{setSettingsLoading(true);setSettingsError('');setSettingsRevision(n=>n+1);};
    function applyPreferences(next: Preferences) { setPreferencesData(next); if (demo) setLanguage(next.language); else setDefaultLanguage(next.language); applyFont(resolveFont(next.font), !demo); setCurrency(next.currencies[0]); }
    // An account that has not finished the welcome setup has chosen no language yet, so the one already showing (saved earlier or matched to the browser) stays until it does.
    const receivePreferences = useEffectEvent((loaded: Preferences) => applyPreferences(loaded.onboarded === false ? { ...loaded, language } : loaded));
    /** Stores preferences without applying them, so the welcome setup can show its closing screen first. */
    async function savePreferences(next: Preferences) {
        const response = await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) });
        const data = await response.json() as Preferences & { error?: string };
        if (!response.ok) throw Error(data.error);
        return data;
    }
    const onboardingNeeded = needsOnboarding({ user, demo, loading: settingsLoading, error: settingsError, preferences: preferencesData });
    const restartOnboarding = async () => applyPreferences(await savePreferences({ ...preferencesData, onboarded: false }));
    useEffect(() => {
        if (!user || demo) return;
        const controller = new AbortController();
        fetch('/api/settings', { signal: controller.signal }).then(async response => {
            const data = await response.json() as Preferences & { error?: string };
            if (!response.ok) throw Error(data.error);
            if (!controller.signal.aborted) { receivePreferences(data); setSettingsError(''); }
        }).catch(error => { if (!controller.signal.aborted) setSettingsError(error.message); }).finally(() => { if (!controller.signal.aborted) setSettingsLoading(false); });
        return () => controller.abort();
    }, [user, demo, settingsRevision]);
    const [deletedItems,setDeletedItems]=useState<DeletedItem[]>([]);
    const [stopping,setStopping]=useState<Entry|null>(null);
    async function stopRecord(end_date:string) {
        if(!stopping)return;
        const stopped={...normalizeEntry(stopping),end_date,account_exchange_rate:undefined};
        if(demo)setRows(previous=>previous.map(row=>row.id===stopped.id?stopped:row));
        else {
            const response=await fetch('/api/records',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(stopped)});
            if(!response.ok)throw Error((await response.json() as {error:string}).error);
            refreshRecords();
        }
        showSaved();
    }
    const [splitting,setSplitting]=useState<Entry|null>(null);
    const [viewing,setViewing]=useState<Entry|null>(null);
    const [tracking, setTracking] = useState<Entry | null>(null);
    const [payingMortgage, setPayingMortgage] = useState<Entry | null>(null);
    async function recordMortgagePayment(payment: MortgagePayment) {
        if (demo) {
            setRows(previous => {
                if (previous.some(row => row.id === payment.id)) return previous;
                const mortgage = previous.find(row => row.id === payment.mortgage_id)!;
                return [...previous.map(row => row.id === mortgage.id ? { ...row, amount: row.amount - payment.principal } : row), { ...fresh(), id: payment.id, name: mortgage.name, kind: 'Other expense', currency: mortgage.currency, amount: decimalSum([payment.principal, payment.interest]), date: payment.date, notes: payment.notes, mortgage_payment_id: payment.id, payment_principal: payment.principal, payment_interest: payment.interest }];
            });
        } else {
            const crossCurrency=payment.exchange_rate!==undefined;
            const payload=crossCurrency?{...payment,record_id:payment.mortgage_id,type:'mortgage_payment',amount:decimalSum([payment.principal,payment.interest]),balance:null}:payment;
            const response = await fetch(crossCurrency?'/api/investment-history/exchange':'/api/mortgage-payments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            const result = await response.json() as { error?: string };
            if (!response.ok) throw Object.assign(new Error(result.error || 'Payment could not be confirmed. Retry with the same details.'),{confirmedFailure:response.status<500});
            refreshRecords();
        }
        showSaved();
    }
    const [businesses, setBusinesses] = useState<Array<{ id: string; name: string }>>([]);
    const [summary, setSummary] = useState<Entry[]>([]);
    const [demoHoldingAccounts,setDemoHoldingAccounts]=useState<HoldingAccount[]>([]);
    const [demoPlanning,setDemoPlanning]=useState<Pick<DemoWorkspace,'goals'|'occurrences'|'categories'>>({goals:[],occurrences:[],categories:[]});
    const [demoTags,setDemoTags]=useState<TagData>(emptyTags);
    const [recordTotal, setRecordTotal] = useState(0);
    const [pageState, setPageState] = useState({ key: '', page: 1 });
    const [recordsLoading, setRecordsLoading] = useState(false);
    const [loadedKey, setLoadedKey] = useState('');
    const recordReadError = useRef('');
    const [reload, setReload] = useState(0);
    const [summaryLoaded, setSummaryLoaded] = useState(false);
    const summaryCache = useRef({ loaded: false, revision: -1 });
    const [recordKinds, setRecordKinds] = useState<readonly string[]>(kinds);
    const { market: liveMarket, loading: marketLoading, error: marketError, refresh } = useMarket(summary, !!user && !demo);
    const market = demo ? demoMarket : liveMarket;
    const snapshots = usePortfolioSnapshots(demo ? null : user, market, summaryLoaded && !marketLoading, reload);
    const [fetchingPrice, setFetchingPrice] = useState(false);
    const priceKey = JSON.stringify([editing?.id, editing?.name, editing?.currency]);
    const [priceResult, setPriceResult] = useState({key:'',message:''});
    const priceMessage = priceResult.key === priceKey ? priceResult.message : '';
    const setPriceMessage = (message:string) => setPriceResult({key:priceKey,message});
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
    const currencyFilter = sectionKey === 'assets' || market?.rates?.[currency] ? '' : currency;
    const {filters,setFilters:updateFilters}=useRecordFilters(sectionKey,demo?'demo':user);
    const setFilters=(next:RecordFiltersValue)=>{updateFilters(next);setPageState({key:'',page:1});};
    const filtersActive = sectionKey !== 'assets' && (activeFilterCount(filters) > 0);
    const historyOnly = sectionKey === 'cashflow';
    const useFilteredRecords = filtersActive || historyOnly;
    const remoteHistory = historyOnly && !demo;
    const paginationKey = user + ':' + sectionKey + ':' + currencyFilter + ':' + JSON.stringify(filters);
    const page = pageState.key === paginationKey ? pageState.page : 1;
    const historyParams=new URLSearchParams({...filters,page:String(page),currency:currencyFilter});
    const historyPage=useOwnerResource('/api/transaction-history?'+historyParams,user,remoteHistory,reload,emptyHistoryPage);
    const serverPage = useFilteredRecords ? 1 : page;
    const serverPaginationKey = recordsRequestKey(user,sectionKey,currencyFilter,0);
    const requestKey = recordsRequestKey(user,sectionKey,currencyFilter,serverPage);
    const refreshRecords = () => { setError(''); setReload(n => n + 1); };
    const [forecastMonth,setForecastMonth] = useState(expensePlanMonth);
    const basePlanning = usePlanning(user, demo, rows, reload, refreshRecords, demoHoldingAccounts, section==='Accounts'?'full':section==='Income & expenses'?'review':'workspace',section==='Income & expenses'?forecastMonth:undefined,demoPlanning);
    const [debtPayment,setDebtPayment]=useState<Entry|null>(null);
    const [editingIncomeSource,setEditingIncomeSource]=useState<import('@/lib/earning-sources').EarningSource|null>(null);
    const earningSources=useEarningSources(user,demo,reload,refreshRecords,(source,original)=>{
        if(original&&rows.some(row=>row.earning_source_id===source.id||row.income_source_id===source.schedule_id)&&['kind','currency','mode','frequency','recurrence_days','start_date','end_date','linked_record_id'].some(key=>original[key as keyof typeof original]!==source[key as keyof typeof source]))throw Error('Keep the type, currency and schedule compatible with recorded payments.');
        const schedule=sourceSchedule(source);
        setRows(previous=>schedule?[...previous.filter(row=>row.id!==schedule.id),schedule]:previous.map(row=>row.id===source.schedule_id?{...row,source_paused:true}:row));
    },legacyEarningSources(rows));
    const planning={...basePlanning,data:{...basePlanning.data,occurrences:demo?[...basePlanning.data.occurrences,...rows.filter(row=>row.earning_source_id&&row.earning_due_on).flatMap(row=>{const source=earningSources.sources.find(source=>source.id===row.earning_source_id);return source?.schedule_id?[{id:row.id,record_id:source.schedule_id,due_on:row.earning_due_on!,status:'paid' as const}]:[];})]:basePlanning.data.occurrences}};
    const transactionTools=useTransactionTools(user,demo,reload,refreshRecords);
    const workspacePreferences=useWorkspacePreferences(user,demo,reload);
    const tagResource=useTags(user,demo,reload,planning.data.records,demoTags);
    const attachments=useRecordAttachments(user,demo,reload);
    // Tags in the person's own order (Settings), wherever they are listed.
    const tags={...tagResource,data:{...tagResource.data,tags:orderById(tagResource.data.tags,savedOrder(workspacePreferences.data.preferences,'tag_order'))}};
    // Businesses in the person's own order (Settings), shared by filters, reports and the dashboard.
    const businessList=orderById(businessesIn(planning.data.records),savedOrder(workspacePreferences.data.preferences,'business_order'));
    // `guide` reopens only the closing guide of business setup, from Settings.
    const [settingUpBusinesses,setSettingUpBusinesses]=useState<boolean|'guide'>(false);
    const overdueCount = upcomingPayments(planning.data.records, planning.data.occurrences, undefined, undefined, planning.data.debtPayments).filter(item => item.overdue).length;
    const lastLoadedKey = useEffectEvent(() => loadedKey);
    const receiveServerPage=useEffectEvent((next:number)=>{if(!useFilteredRecords&&next!==page)setPageState({key:paginationKey,page:next});});
    // The month picker belongs to Cash flow. Every other screen plans for the current month.
    const planningMonth = section === 'Income & expenses' ? forecastMonth : expensePlanMonth();
    const expensePlans = useExpensePlans(user, demo, rows, reload, refreshRecords, planningMonth);
    useEffect(() => {
        if (!user || demo || section === 'Settings') return;
        const controller = new AbortController();
        const markLoading = setTimeout(() => { if (!controller.signal.aborted) setRecordsLoading(true); }, 0);
        const params = new URLSearchParams({ page: String(serverPage), section: sectionKey, summary: summaryCache.current.loaded && summaryCache.current.revision === reload ? '0' : '1' });
        if (currencyFilter) params.set('currency', currencyFilter);
        refreshRead('/api/records?' + params, { signal: controller.signal }).then(async response => {
            const data = await response.json() as { error?: string; records: Entry[]; total: number; page: number; summary?: Entry[]; businesses?: Array<{ id: string; name: string }> };
            if (!response.ok) throw Error(data.error);
            if (controller.signal.aborted) return;
            setError(previous => previous === recordReadError.current ? '' : previous);
            setRows(data.records.map(normalizeEntry)); setRecordTotal(data.total);
            if (data.summary) { setSummary(data.summary.map(normalizeEntry)); setBusinesses(data.businesses || []); setSummaryLoaded(true); summaryCache.current = {loaded:true,revision:reload}; }
            setLoadedKey(recordsRequestKey(user,sectionKey,currencyFilter,data.page)); receiveServerPage(data.page);
        }).catch(error => { if (!controller.signal.aborted) { recordReadError.current=error.message; setError(error.message); if (lastLoadedKey() !== requestKey) { setRows([]); setRecordTotal(0); setLoadedKey(requestKey); } } })
          .finally(() => { clearTimeout(markLoading); if (!controller.signal.aborted) setRecordsLoading(false); });
        return () => { clearTimeout(markLoading); controller.abort(); };
    }, [user, demo, serverPage, section, sectionKey, currencyFilter, reload, serverPaginationKey, requestKey]);
    useEffect(() => { const url = new URL(window.location.href); const authError = url.searchParams.get('auth_error'); if (authError) {
        const messages: Record<string, string> = { google_setup: 'Google sign-in is awaiting setup. You can still sign in with email.', google_unavailable: 'Google sign-in is temporarily unavailable. Please try again.', google_cancelled: 'Google sign-in was not completed. Please try again.', google_expired: 'Your sign-in attempt expired. Please start again.', google_failed: 'Google sign-in failed. Please try again or use email.' };
        queueMicrotask(() => setError(messages[authError] ?? 'Sign-in could not be completed. Please try again.'));
        url.searchParams.delete('auth_error');
        window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    } fetch('/api/auth').then(r => r.json() as Promise<{
        configured: boolean;
        user: null | {
            email: string;
        };
        next?: string;
    }>).then(async (d) => { setConfigured(d.configured); if (d.next) { window.location.replace(d.next); return; } if (d.user) {
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
            next?: string;
        };
        if (!r.ok)
            throw Error(d.error);
        // A Telegram chat waiting to be connected takes over right after signing in.
        if (d.next) { window.location.replace(d.next); return; }
        setUser(d.user.email);

    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    // A repeated message leaves the error state unchanged, so show the popup directly as well.
    const fail = (message: string) => { setError(message); showError(message); };
    async function save(e: React.FormEvent) { e.preventDefault(); if (!editing)
        return; if ((editing.kind === 'Money lent' && (!editing.lent_date || (editing.date && editing.date < editing.lent_date))) || (editing.kind !== 'Money lent' && !editing.date)) { fail('Check the record fields.'); return; }
        if (cashFlowAmountMissing(editing)) { fail('Enter an amount greater than zero.'); return; }
        if (requiresCashAccount(editing) && editing.date > today()) { fail('Actual income and expenses cannot be dated in the future.'); return; }
        setBusy(true); setError(''); try {
        if (editing.expense_plan_id) {
            const plan = expensePlans.plans.find(p => p.id === editing.expense_plan_id);
            if (!plan || editing.currency !== plan.currency || editing.frequency !== 'Once' || !expenses.includes(editing.kind) || editing.business_id || editing.date < plan.start_date || (plan.end_date && editing.date > plan.end_date)) throw Error('Check the expense plan, currency and spending date.');
        }
        if(requiresCashAccount(editing)&&(!editing.account_id||planning.loading||planning.error||!planning.data.records.some(record=>record.id===editing.account_id&&record.kind==='Cash')))throw Error('Choose a cash account.');
        const previewRate=Number(new FormData(e.currentTarget as HTMLFormElement).get('account_exchange_rate'));
        const cashAccount=planning.data.records.find(record=>record.id===editing.account_id);
        if(editing.account_id&&cashAccount?.currency!==editing.currency&&(!Number.isFinite(previewRate)||previewRate<=0))throw Error('Historical exchange rates are unavailable.');
        const earningPatch=editing.earning_source_id?resolveEarningSource(editing,earningSources.sources,rows.find(row=>row.id===editing.id)):{};
        if(demo&&earningPatch.earning_due_on&&rows.some(row=>row.id!==editing.id&&row.earning_source_id===editing.earning_source_id&&row.earning_due_on===earningPatch.earning_due_on))throw Error('This scheduled payment is already recorded.');
        const incomeSourcePatch=editing.income_source_id?resolveIncomeSource(editing,planning.data.records):{};
        if(demo&&editing.kind==='Salary'&&editing.income_source_id&&rows.some(row=>row.id!==editing.id&&row.income_source_id===editing.income_source_id&&row.income_due_on===incomeSourcePatch.income_due_on))throw Error('This salary payment is already recorded.');
        const savedRecord={...editing,name:expenses.includes(editing.kind)&&!editing.name.trim()?(editing.notes.trim().slice(0,120)||planning.data.categories.find(category=>category.id===editing.custom_category_id)?.name||t(editing.kind)):editing.name,account_exchange_rate:editing.account_id&&cashAccount?.currency!==editing.currency?previewRate:undefined,...(liabilities.includes(editing.kind)&&!rows.some(row=>row.id===editing.id)?{opened_on:editing.opened_on??today()}:{})};
        Object.assign(savedRecord,incomeSourcePatch,earningPatch);
        // An account that changes business takes its transactions along, so the business moves through set_account_business after the save.
        const previousAccount=isBusinessAccount(editing)?(planning.data.records.find(record=>record.id===editing.id)??rows.find(record=>record.id===editing.id)):undefined;
        const movesBusiness=!!previousAccount&&(previousAccount.business_id??null)!==(editing.business_id??null);
        if(movesBusiness)savedRecord.business_id=previousAccount!.business_id??null;
        if(liabilities.includes(savedRecord.kind)&&savedRecord.opened_on&&(savedRecord.opened_on>today()||savedRecord.date<savedRecord.opened_on))throw Error('Check the start and due dates.');
        if (!demo) {
            const r = await fetch('/api/records', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(savedRecord) });
            if (!r.ok)
                throw Error((await r.json() as {
                    error: string;
                }).error);
        }
        if (demo) {
            const original=rows.find(record=>record.id===savedRecord.id);
            setRows(withAssetIncomePlans(applyRecordChange(rows,original,savedRecord),earningSources.sources));
        }
        else refreshRecords();
        if(movesBusiness)await setAccountBusiness(editing.id,editing.business_id??null);
        setEditing(null);
        showSaved();
    }
    catch (e) {
        fail((e as Error).message);
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
        if (demo) {
            const original=rows.find(row=>row.id===deleting.id)||deleting;
            const updated=applyRecordChange(rows,original);
            setDeletedItems(prev=>[{id:crypto.randomUUID(),source:'finance_records',data:original,deleted_at:new Date().toISOString()},...prev]);
            setRows(updated);
        }
        else refreshRecords();
        setDeleting(null);
    }
    catch (e) {
        fail((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    function clearLocalSession() { setEditing(null); setDeleting(null); setStopping(null); setSplitting(null); setViewing(null); setTracking(null); setPayingMortgage(null); setSettingsError(''); setPageState({key:'',page:1}); setRecordKinds(kinds); setPriceResult({key:'',message:''}); setLoadedKey(''); setSettingsLoading(true); setUser(null); setDemo(false); setDemoHoldingAccounts([]); setDemoPlanning({goals:[],occurrences:[],categories:[]}); setDemoTags(emptyTags); setSettingUpBusinesses(false); setDeletedItems([]); setRows([]); setSummary([]); setBusinesses([]); setRecordTotal(0); setPreferencesData(defaultPreferences); setCurrency('USD'); setSummaryLoaded(false); summaryCache.current = {loaded:false,revision:-1}; setError(''); }
    async function logout() { if (!demo) {
        const r = await fetch('/api/auth', { method: 'DELETE' });
        if (!r.ok) {
            setError('Could not sign out. Please try again.');
            return;
        }
    } clearLocalSession(); }
    const budget = monthlyBudgetTotals(expensePlans.plans, expensePlans.month, (amount, source) => convertAmount(amount, source, currency, market?.rates ?? market?.fx?.rate));
    const planProjection = budget.partial.projected;
    const forecastReady = !expensePlans.loading && !expensePlans.error;
    const excludedCurrencies=[...new Set((demo?rows:summary).filter(record=>[...assets,...liabilities].includes(record.kind)&&marketEntry(record,currency,market)===null).map(record=>record.currency))];
    const current = (demo ? rows : summary).map(r => marketEntry(r, currency, market)).filter((r): r is Entry => r !== null);
    const monthlyIncomeEntries = planning.data.records.map(r => marketEntry(r, currency, market)).filter((r): r is Entry => r !== null);
    const { totalDebt, netWorth } = financialTotals(current);
    const forecast = estimatedCashFlow(current, planProjection, planningMonth);
    const sortRecords = (entries: Entry[]) => [...entries].sort((a,b) => compareRecordDates(a.kind === 'Money lent' ? a.lent_date || a.date : a.date, b.kind === 'Money lent' ? b.lent_date || b.date : b.date) || b.id.localeCompare(a.id));
    const demoVisible = (sectionKey === 'assets' ? sortAssetsByWorth : sortRecords)(current.filter(r => section === 'Overview' || (section === 'Assets & investments' ? assetRecordKinds : section === 'Loans & debts' ? lendingRecordKinds : [...income, ...expenses]).includes(r.kind)));
    const filteredRecords = filterRecords((demo ? rows : planning.data.records).filter(r => (!historyOnly || isTransactionHistory(r)) && (sectionKey === 'all' || (sectionKey === 'debts' ? lendingRecordKinds : [...income,...expenses]).includes(r.kind)) && (!currencyFilter || r.currency === currencyFilter)),filters,locale);
    const totalRecords = remoteHistory ? historyPage.data.total : useFilteredRecords ? filteredRecords.length : demo ? demoVisible.length : recordTotal;
    const pageCount = Math.max(1, Math.ceil(totalRecords / 10));
    const tablePage = remoteHistory ? historyPage.data.page : Math.min(page,pageCount);
    const tableLoading = remoteHistory ? historyPage.loading : !demo && (useFilteredRecords ? planning.loading : loadedKey !== requestKey);
    const workspaceLoading = !demo && (settingsLoading || (!summaryLoaded && tableLoading) || expensePlans.loading || (!market && marketLoading));
    const visible = remoteHistory ? historyPage.data.records.map(r=>marketEntry(normalizeEntry(r),currency,market)??normalizeEntry(r)) : useFilteredRecords ? filteredRecords.slice((tablePage-1)*10,tablePage*10).map(r=>marketEntry(r,currency,market)??r) : demo ? demoVisible.slice((page - 1) * 10, page * 10) : tableLoading ? [] : sectionKey === 'assets' ? sortAssetsByWorth(rows, r => marketEntry(r, currency, market)).slice((page - 1) * 10, page * 10).map(r => marketEntry(r, currency, market) ?? r) : rows.map(r => marketEntry(r, currency, market) ?? r);

    const cashFlowSection = section === 'Income & expenses';
    const availableBusinesses = demo ? rows.filter(r => r.kind === 'Business') : businesses;
    const editingCashFlow = !!editing && [...income, ...expenses].includes(editing.kind);
    const linkedExpensePlan = expensePlans.plans.find(plan => plan.id === editing?.expense_plan_id);
    async function removePlan(id:string) {
        const plan=expensePlans.plans.find(plan=>plan.id===id);
        await expensePlans.remove(id);
        if(demo&&plan)setDeletedItems(prev=>[{id:crypto.randomUUID(),source:'expense_plans',data:plan,deleted_at:new Date().toISOString()},...prev]);
    }
    function restoreDemoItem(item:DeletedItem) {
        if(item.source==='expense_plans')expensePlans.restoreDemo(item.data);
        // Demo goals cannot be deleted, so they never reach Recently deleted.
        else if(item.source==='savings_goals')return;
        else {
            const entry=item.data;
            if(entry.business_id&&!rows.some(row=>row.id===entry.business_id&&row.kind==='Business'))throw Error('Could not restore this item. Restore its linked plan or business first, and check that its original dates and currency are still allowed.');
            if(entry.expense_plan_id){const plan=expensePlans.plans.find(plan=>plan.id===entry.expense_plan_id);if(!plan||plan.currency!==entry.currency||entry.date<plan.start_date||(plan.end_date&&entry.date>plan.end_date))throw Error('Could not restore this item. Restore its linked plan or business first, and check that its original dates and currency are still allowed.');}
            setRows(applyRecordChange(rows,undefined,entry));
        }
        setDeletedItems(prev=>prev.filter(deleted=>deleted.id!==item.id));
    }
    const spendFromPlan = (plan: ExpensePlan) => {
        setError(''); setRecordKinds(expenses);
        const date = depositToday() < plan.start_date ? plan.start_date : plan.end_date && depositToday() > plan.end_date ? plan.end_date : depositToday();
        setEditing({ ...fresh(), name: plan.name, kind: plan.category === 'Groceries' || plan.category === 'Household' ? 'Living expense' : 'Other expense', currency: plan.currency, frequency: 'Once', expense_plan_id: plan.id, date });
    };

    const addCashFlow = (kind: Entry['kind']) => { setError(''); setRecordKinds(income.includes(kind) ? income : expenses); setEditing({ ...fresh(), currency, kind, frequency:'Once' }); };
    const addRecord = () => {
        if (cashFlowSection) { addCashFlow('Other expense'); return; }
        setError('');
        setRecordKinds(section === 'Assets & investments' ? assetRecordKinds : section === 'Loans & debts' ? lendingRecordKinds : kinds);
        setEditing({ ...fresh(), currency, kind: section === 'Loans & debts' ? 'Mortgage' : 'Cash' });
    };
    const addAccountRecord = (kind: 'Cash'|'Deposit'|'Stock'|'Crypto', holdingAccountId?: string) => {
        setError(''); setRecordKinds(holdingAccountId ? [kind] : kind==='Cash'||kind==='Deposit' ? ['Cash','Deposit'] : ['Stock','Crypto']);
        const account=planning.data.holdingAccounts?.find(item=>item.id===holdingAccountId);
        setEditing({...fresh(),kind,is_investment:kind==='Cash'&&account?.kind==='Cash',currency:account&&preferencesData.currencies.includes(account.currency)?account.currency:currency,holding_account_id:holdingAccountId??null});
    };
    const saveHoldingAccount = async (account: HoldingAccount) => {
        if(demo){setDemoHoldingAccounts(items=>[...items.filter(item=>item.id!==account.id),account]);showSaved();return;}
        const response=await fetch('/api/holding-accounts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'save',...account})});
        const result=await response.json() as {error?:string};if(!response.ok)throw Error(result.error);
        refreshRecords();
        showSaved();
    };
    const assignHolding = async (record: Entry, accountId: string|null) => {
        if(demo){setRows(items=>items.map(item=>item.id===record.id?{...item,holding_account_id:accountId}:item));showSaved();return;}
        const response=await fetch('/api/holding-accounts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'assign',record_id:record.id,holding_account_id:accountId})});
        const result=await response.json() as {error?:string};if(!response.ok)throw Error(result.error);
        refreshRecords();
        showSaved();
    };
    // Tables show display-currency copies. Dialogs must work on the saved record, in its own
    // currency. Transaction history returns raw rows, so normalize to the record shape forms expect.
    const storedRecord = (record: Entry) => normalizeEntry(historyPage.data.records.find(r=>r.id===record.id) || planning.data.records.find(r=>r.id===record.id) || rows.find(r => r.id === record.id) || (demo ? record : summary.find(r => r.id === record.id) || record));
    const editRecord = (record: Entry) => {
        const source=earningSources.sources.find(source=>source.schedule_id===record.id);
        if(source){setEditingIncomeSource(source);return;}
        setError('');
        setRecordKinds(income.includes(record.kind) ? income : expenses.includes(record.kind) ? expenses : assetRecordKinds.includes(record.kind) ? assetRecordKinds : lendingRecordKinds);
        setEditing(storedRecord(record));
    };
    const closeEditing = () => { setError(''); setEditing(null); };
    const closeDeleting = () => { setError(''); setDeleting(null); };
    const navigate = (path: string) => router.push(path);
    const field = (key: keyof Entry, v: string | number) => setEditing(p => p ? { ...p, [key]: v, ...(key === 'currency' ? {account_id: null} : {}) } : p);

    async function startDemo() {
        setBusy(true); setError('');
        try {
            // The sample workspace comes from the backend, like a signed-in account's records.
            const response = await fetch('/api/demo', { cache: 'no-store' });
            if (!response.ok) throw Error();
            const sample = await response.json() as DemoWorkspace;
            setRows(withAssetIncomePlans(sample.records.map(normalizeEntry))); setDemoHoldingAccounts(sample.holdingAccounts); setDemoPlanning({goals:sample.goals,occurrences:sample.occurrences,categories:sample.categories}); setDemoTags(sample.tags); expensePlans.seedDemo(sample.expensePlans); setDemo(true);
        } catch { setError('Connection unavailable. Please try again.'); }
        finally { setBusy(false); }
    }
    const quickExpense = () => { setError(''); setRecordKinds(expenses); setEditing({ ...fresh(), currency, kind: 'Other expense', frequency: 'Once' }); };
    const recordFromSource = (source: EarningSource, bonus?: boolean) => { setError(''); const entry = { ...fresh(), kind: source.kind, currency: source.currency, frequency: 'Once' as const }; setRecordKinds(income); setEditing({ ...entry, ...selectEarningSource(entry, source, bonus) }); };
    const reviewRecurring = (record: Entry) => { setError(''); setRecordKinds([...income, ...expenses]); setEditing(record); };
    const requestDelete = (record: Entry) => { setError(''); setDeleting(record); };
    const discardDeletedItem = (item: DeletedItem) => setDeletedItems(items => items.filter(existing => existing.id !== item.id));
    const showFirstPage = () => setPageState({ key: paginationKey, page: 1 });
    const showPage = (next: number) => setPageState({ key: paginationKey, page: next });
    /** Moves transactions to another category: the Transactions page's inline change, Edit multiple and rules. Resolves to how many changed. */
    async function categorize(ids: string[], choice: CategoryChoice) {
        if (demo) {
            const changed = recategorize(rows, ids, choice, transactionTools.data.splits).changed;
            setRows(previous => recategorize(previous, ids, choice, transactionTools.data.splits).records);
            return changed;
        }
        const response = await fetch('/api/transaction-rules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'categorize', data: { ids, kind: choice.kind, category_id: choice.category_id } }) });
        const result = await response.json() as { changed?: number; error?: string };
        if (!response.ok) throw Error(result.error);
        refreshRecords();
        return result.changed ?? 0;
    }
    /** Moves transactions to a business, or to the household with null. Resolves to how many changed. */
    async function assignTransactionsBusiness(ids: string[], business: string | null) {
        if (demo) {
            const names = new Map(rows.filter(row => row.kind === 'Business').map(row => [row.id, row.name]));
            const changed = assignBusiness(rows, ids, business, names).changed;
            setRows(previous => assignBusiness(previous, ids, business, names).records);
            return changed;
        }
        const response = await fetch('/api/transaction-rules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'business', data: { ids, business_id: business } }) });
        const result = await response.json() as { changed?: number; error?: string };
        if (!response.ok) throw Error(result.error);
        refreshRecords();
        return result.changed ?? 0;
    }
    /** Puts an account in a business (or the household); its transactions that followed it move too. Resolves to how many transactions moved. */
    async function setAccountBusiness(accountId: string, business: string | null) {
        if (demo) {
            const changed = moveAccountToBusiness(rows, accountId, business).changed;
            setRows(previous => moveAccountToBusiness(previous, accountId, business).records);
            return changed;
        }
        const response = await fetch('/api/transaction-rules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'account_business', data: { account_id: accountId, business_id: business } }) });
        const result = await response.json() as { changed?: number; error?: string };
        if (!response.ok) throw Error(result.error);
        refreshRecords();
        return result.changed ?? 0;
    }
    /** Saves a business profile (a Business record) outside the record dialog: business setup and Settings. */
    async function saveBusiness(entry: Entry) {
        const record = normalizeEntry(entry);
        if (demo) setRows(previous => applyRecordChange(previous, previous.find(row => row.id === record.id), record));
        else {
            const response = await fetch('/api/records', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(record) });
            if (!response.ok) throw Error((await response.json() as { error: string }).error);
            refreshRecords();
        }
    }
    const newBusiness = (name = ''): Entry => ({ ...fresh(), name, kind: 'Business', currency, amount: 0 });
    return {
        // Session
        ready, user, demo, pathname, section, sectionKey, cashFlowSection, busy, configured, error, login, logout, startDemo, clearLocalSession,
        // Preferences
        currency, setCurrency, preferencesData, applyPreferences, savePreferences, settingsLoading, settingsError, retrySettings, workspacePreferences, onboardingNeeded, restartOnboarding, saveTrackingStart: saveTrackingStartRequest,
        // Records and market data
        rows, summary, current, market, marketLoading, marketError, refresh, quoteLabel, money, planning, earningSources, transactionTools, expensePlans, snapshots,
        reload, refreshRecords, budget, forecast, forecastReady, forecastMonth, setForecastMonth, excludedCurrencies, netWorth, totalDebt, monthlyIncomeEntries,
        availableBusinesses, businessList, tags, attachments, overdueCount, workspaceLoading, deletedItems, restoreDemoItem, discardDeletedItem,
        // Record table
        filters, setFilters, filtersActive, historyOnly, useFilteredRecords, remoteHistory, historyPage, visible, totalRecords, pageCount, tablePage, tableLoading,
        recordsLoading, showFirstPage, showPage,
        // Actions
        addRecord, addCashFlow, addAccountRecord, editRecord, storedRecord, closeEditing, closeDeleting, navigate, quickExpense, recordFromSource, reviewRecurring, requestDelete, spendFromPlan, removePlan,
        saveHoldingAccount, assignHolding, recordMortgagePayment, save, remove, stopRecord, categorize, assignTransactionsBusiness, setAccountBusiness, saveBusiness, newBusiness, field, fetchPrice, fetchingPrice, priceMessage,
        // Open dialogs
        editing, setEditing, editingCashFlow, recordKinds, linkedExpensePlan, deleting, setDeleting, stopping, setStopping, splitting, setSplitting,
        settingUpBusinesses, setSettingUpBusinesses,
        viewing, setViewing, tracking, setTracking, payingMortgage, setPayingMortgage, debtPayment, setDebtPayment, editingIncomeSource, setEditingIncomeSource,
    };
}

export type Workspace = ReturnType<typeof useWorkspaceState>;
const WorkspaceContext = createContext<Workspace | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
    const workspace = useWorkspaceState();
    return <WorkspaceContext.Provider value={workspace}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
    const workspace = useContext(WorkspaceContext);
    if (!workspace) throw new Error('useWorkspace must be used within WorkspaceProvider');
    return workspace;
}
