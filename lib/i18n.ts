import en from './locales/en.json';
import es from './locales/es.json';
import pt from './locales/pt.json';
import ru from './locales/ru.json';
import ar from './locales/ar.json';
import zh from './locales/zh.json';
import ja from './locales/ja.json';
import ko from './locales/ko.json';
import fr from './locales/fr.json';
import hi from './locales/hi.json';
import ur from './locales/ur.json';
import bn from './locales/bn.json';
import th from './locales/th.json';
import vi from './locales/vi.json';
import uz from './locales/uz.json';
import { languageCatalogue, languageCodes, type Language } from './languages';

export type { Language } from './languages';
export { languageCatalogue, languageCodes } from './languages';
export const locales = Object.fromEntries(languageCatalogue.map(language => [language.code, language.locale])) as Record<Language, string>;
// Mexican Spanish shares the Spanish text; only its number and date formats differ.
export const dictionaries: Record<Language, Record<string, string>> = { en, es, 'es-MX': es, pt, fr, ru, ar, ur, hi, bn, zh, ja, ko, th, vi, uz };
export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (languageCodes as readonly string[]).includes(value);
}
/** Text direction for a language; Arabic reads right to left. */
export const directionOf = (language: Language) => languageCatalogue.find(item => item.code === language)?.dir ?? 'ltr';
// Latin American browsers get Mexican Spanish formats; other Spanish browsers get Spanish (Spain).
const latinAmericanSpanish = new Set(['es-mx', 'es-419', 'es-us', 'es-ar', 'es-co', 'es-cl', 'es-pe', 'es-ve', 'es-ec', 'es-uy', 'es-cr', 'es-gt']);
/** The first supported language in the browser's preference order. English is the fallback. */
export function detectLanguage(preferred: readonly string[] | undefined): Language {
  for (const tag of preferred ?? []) {
    const lower = String(tag).toLowerCase().replace('_', '-');
    if (latinAmericanSpanish.has(lower)) return 'es-MX';
    const primary = lower.split('-')[0];
    if (isLanguage(primary)) return primary;
  }
  return 'en';
}
export function translate(language: Language, key: string, params: Record<string, string | number> = {}) {
  const text = Object.hasOwn(dictionaries[language], key) ? dictionaries[language][key] : key;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => params[name] === undefined ? match : String(params[name]));
}
