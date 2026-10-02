import type { CategoryKind } from './category-colors';

// One emoji per category, so a row can be recognised before its name is read.
// Pair it with `categoryColor`; both stay stable across sorting and languages.
export const categoryEmojis: Record<CategoryKind, string> = {
 Cash: '💵', Stock: '📈', Crypto: '🪙', Deposit: '🏦', 'Treasury bill': '🏛️',
 Property: '🏠', Business: '🏪', Valuables: '💎', 'Money lent': '🤝',
 Mortgage: '🏡', Loan: '💸', Debt: '💳',
 Salary: '💰', 'Rent income': '🏘️', 'Business income': '💼', 'Other income': '✨',
 'Rent expense': '🔑', 'Living expense': '🛒', Charity: '🤲', 'Other expense': '🧾',
 Groceries: '🥦', 'Family support': '👪', Household: '🧺', Other: '🏷️',
};

const leadingEmoji = /^(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier})*)/u;

/** The emoji for a category. A custom category whose name starts with an emoji keeps that emoji. */
export function categoryEmoji(kind: string): string {
 if (Object.hasOwn(categoryEmojis, kind)) return categoryEmojis[kind as CategoryKind];
 return kind.trim().match(leadingEmoji)?.[1] ?? categoryEmojis.Other;
}
