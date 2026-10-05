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

/** The icons a person can choose for a category, in groups so the right one is quick to find. */
export const categoryIconGroups = [
 { name: 'Income', icons: ['💰', '💵', '💶', '💷', '💴', '💸', '💳', '🪙', '💼', '📈', '🏦', '🧾', '🎁', '🏆', '✨', '🤝'] },
 { name: 'Home', icons: ['🏠', '🏡', '🏘️', '🏢', '🔑', '🛋️', '🛏️', '🧺', '🧹', '🧼', '🔧', '🔨', '🪴', '💡', '🔌', '🚿', '🔥', '💧', '📶', '📺'] },
 { name: 'Food and drink', icons: ['🛒', '🥦', '🍎', '🥖', '🥩', '🧀', '🍳', '🍕', '🍔', '🍜', '🍣', '🥗', '☕', '🍵', '🧃', '🍷', '🍺', '🍰', '🍽️', '🥡'] },
 { name: 'Transport', icons: ['🚗', '🚕', '🚌', '🚇', '🚆', '✈️', '🚲', '🛵', '⛽', '🅿️', '🚙', '🛞', '🚢', '🗺️'] },
 { name: 'Shopping', icons: ['🛍️', '👕', '👗', '👟', '👜', '💄', '💍', '⌚', '📱', '💻', '🎧', '📷', '🎮', '🧸', '📦', '🏷️'] },
 { name: 'Health', icons: ['💊', '🩺', '🏥', '🦷', '👓', '🧴', '💇', '💅', '🏋️', '🧘', '🩹', '❤️'] },
 { name: 'Leisure', icons: ['🎬', '🎭', '🎵', '🎨', '📚', '⚽', '🎾', '🏊', '⛺', '🏖️', '🎟️', '🎉', '🎂', '🍿', '🎲', '🧳'] },
 { name: 'Family and people', icons: ['👪', '👶', '🧒', '🎓', '🏫', '🐶', '🐱', '💝', '🤲', '🙏', '🕌', '⛪', '💐', '👵'] },
 { name: 'Money and work', icons: ['📊', '📉', '🧮', '📝', '📄', '🗂️', '🏛️', '⚖️', '🛡️', '📮', '🖨️', '🔒', '💎', '🏪', '🏭', '🚜'] },
] as const;

const choices = new Set<string>(categoryIconGroups.flatMap(group => group.icons));
/** Whether an icon is one of the choices, as saved preferences must be. */
export const isCategoryIcon = (icon: string) => choices.has(icon);

/** Icons chosen for categories, by built-in category name or added category id. */
export type CategoryIcons = Readonly<Record<string, string>>;

/** The icon shown for a category: the chosen one, else the default. `kind` is a built-in name, an added category's id, or its name. */
export function chosenCategoryEmoji(kind: string, icons: CategoryIcons, categories: readonly { id: string; name: string }[] = []): string {
 const id = Object.hasOwn(icons, kind) ? kind : categories.find(category => category.name === kind)?.id;
 const chosen = id !== undefined && Object.hasOwn(icons, id) ? icons[id] : undefined;
 return chosen && isCategoryIcon(chosen) ? chosen : categoryEmoji(kind);
}
