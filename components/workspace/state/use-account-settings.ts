"use client";
import { useEffect, useEffectEvent, useState } from 'react';
import { requestJson } from '@/lib/api-client';
import { useLanguage } from '@/components/language-provider';
import { defaultPreferences, type Preferences } from '@/lib/currencies';
import { applyFont, resolveFont } from '@/lib/fonts';
import { needsOnboarding } from '@/lib/onboarding';

/** The account's saved defaults (Settings): language, font, currencies and whether the welcome setup is done. The
 * sample workspace keeps them for the visit only. */
export function useAccountSettings(user: string | null, demo: boolean) {
    const { language, setDefaultLanguage, setLanguage } = useLanguage();
    const [preferencesData, setPreferencesData] = useState<Preferences>(defaultPreferences);
    const [currency, setCurrency] = useState<string>('USD');
    const [settingsLoading, setSettingsLoading] = useState(true);
    const [settingsError, setSettingsError] = useState('');
    const [settingsRevision,setSettingsRevision]=useState(0);
    const retrySettings=()=>{setSettingsLoading(true);setSettingsError('');setSettingsRevision(n=>n+1);};
    function applyPreferences(next: Preferences) { setPreferencesData(next); if (demo) setLanguage(next.language); else setDefaultLanguage(next.language); applyFont(resolveFont(next.font), !demo); setCurrency(next.currencies[0]); }
    // An account that has not finished the welcome setup has chosen no language yet, so the one already showing (saved earlier or matched to the browser) stays until it does.
    const receivePreferences = useEffectEvent((loaded: Preferences) => applyPreferences(loaded.onboarded === false ? { ...loaded, language } : loaded));
    /** Stores preferences without applying them, so the welcome setup can show its closing screen first. */
    async function savePreferences(next: Preferences) {
        return requestJson<Preferences>('/api/settings', { method: 'PUT', body: next, fallback: 'Could not save changes.' });
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
    /** Signing out forgets the account's defaults. */
    const resetSettings = () => { setSettingsError(''); setSettingsLoading(true); setPreferencesData(defaultPreferences); setCurrency('USD'); };
    return { preferencesData, currency, setCurrency, applyPreferences, savePreferences, settingsLoading, settingsError, retrySettings, onboardingNeeded, restartOnboarding, resetSettings };
}
