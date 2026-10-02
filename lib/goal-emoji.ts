import type { Goal } from './planning';

// A cover emoji for a goal card, read from its name in the common interface languages.
// Names only refine the picture; the goal's kind supplies the fallback.
const themes: [RegExp, string][] = [
 [/emergenc|rainy|safety|cushion|подушк|резерв|чрезвыч|favqulod|zaxira|zahira|notfall|urgenc|emergên/iu, '🧯'],
 [/vacation|holiday|travel|trip|journey|отпуск|путешеств|sayohat|ta[‘’ʻʼ']?til|urlaub|reise|viaje|vacanc|voyage|tatil|liburan/iu, '🏖️'],
 [/house|home|apartment|flat|down ?payment|mortgage|дом|квартир|жиль|\buy\b|kvartira|haus|wohnung|casa|maison|ev\b|rumah/iu, '🏡'],
 [/\bcar\b|auto|vehicle|машин|автомоб|mashina|coche|voiture|araba|mobil\b/iu, '🚗'],
 [/wedding|marriage|свадьб|to[‘’ʻʼ']?y\b|hochzeit|boda|mariage|düğün|nikah/iu, '💍'],
 [/educat|college|universit|school|tuition|study|учеб|образов|универс|ta[‘’ʻʼ']?lim|o[‘’ʻʼ']?qish|kontrakt|studium|escuela|école|okul|kuliah/iu, '🎓'],
 [/retire|pension|пенси|nafaqa|rente|jubila|retraite|emekli|pensiun/iu, '🌅'],
 [/baby|child|kid|ребен|дет|bola|farzand|kind\b|bebé|enfant|bebek|anak/iu, '🍼'],
 [/laptop|computer|phone|iphone|macbook|ноутбук|телефон|компьют|telefon/iu, '💻'],
 [/hajj|umrah|хадж|умр|haj\b|ҳаж/iu, '🕋'],
 [/business|startup|бизнес|biznes|negocio|entreprise|işletme|usaha/iu, '🏪'],
 [/gift|present|подар|sovg[‘’ʻʼ']?a|geschenk|regalo|cadeau|hediye|hadiah/iu, '🎁'],
];

export function goalEmoji(goal: Pick<Goal, 'name' | 'kind'>, crypto = false) {
 const themed = themes.find(([pattern]) => pattern.test(goal.name));
 if (themed) return themed[1];
 return goal.kind === 'investment' ? crypto ? '🪙' : '📈' : goal.kind === 'net_worth' ? '🎯' : '🐷';
}
