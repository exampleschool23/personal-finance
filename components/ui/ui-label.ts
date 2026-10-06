import { useContext } from 'react';
import { LanguageContext } from '@/components/language-context';
import { translate } from '@/lib/i18n';

/** Labels inside the shared ui primitives (dialog and sheet Close, the drawer's name): translated under a LanguageProvider, English without one, so a primitive never throws. */
export function useUiLabel() {
  const context = useContext(LanguageContext);
  return (key: string) => context ? translate(context.language, key) : key;
}
