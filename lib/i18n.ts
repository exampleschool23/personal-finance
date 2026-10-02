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
import de from './locales/de.json';
import it from './locales/it.json';
import tr from './locales/tr.json';
import id from './locales/id.json';
import ms from './locales/ms.json';
import pl from './locales/pl.json';
import uk from './locales/uk.json';
import nl from './locales/nl.json';
import cs from './locales/cs.json';
import ro from './locales/ro.json';
import fa from './locales/fa.json';
import he from './locales/he.json';
import fil from './locales/fil.json';
import sw from './locales/sw.json';
import { languageCatalogue, languageCodes, type Language } from './languages';

export type { Language } from './languages';
export { languageCatalogue, languageCodes } from './languages';
export const locales = Object.fromEntries(languageCatalogue.map(language => [language.code, language.locale])) as Record<Language, string>;
// Mexican Spanish shares the Spanish text; only its number and date formats differ.
export const dictionaries: Record<Language, Record<string, string>> = { en, es, 'es-MX': es, pt, fr, ru, ar, ur, hi, bn, zh, ja, ko, th, vi, uz, de, it, tr, id, ms, pl, uk, nl, cs, ro, fa, he, fil, sw };
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
/** The language tags of an Accept-Language header, most preferred first. */
export function acceptedLanguages(header: string | null | undefined): string[] {
  return (header ?? '').split(',').map((part, index) => {
    const [tag, ...params] = part.trim().split(';');
    const quality = Number(params.find(param => param.trim().startsWith('q='))?.split('=')[1] ?? 1);
    return { tag: tag.trim(), quality: Number.isFinite(quality) ? quality : 0, index };
  }).filter(item => item.tag && item.tag !== '*' && item.quality > 0).sort((a, b) => b.quality - a.quality || a.index - b.index).map(item => item.tag);
}
export function translate(language: Language, key: string, params: Record<string, string | number> = {}) {
  const text = Object.hasOwn(dictionaries[language], key) ? dictionaries[language][key] : key;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => params[name] === undefined ? match : String(params[name]));
}
