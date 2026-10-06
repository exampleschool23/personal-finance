import { useLanguage } from '@/components/language-provider';
import { Button } from '@/components/ui/button';

/** "Today" beside a month or year switcher. It is off while the current period is on screen, and says so. */
export function TodayButton({ current, onClick }: { current: boolean; onClick: () => void }) {
 const { t } = useLanguage();
 return <span title={current ? t('Today is already shown.') : undefined}><Button variant="outline" disabled={current} onClick={onClick}>{t('Today')}</Button></span>;
}
