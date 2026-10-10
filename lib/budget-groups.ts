import { defaultGroups, type BudgetCategory, type BudgetCategorySetting, type BudgetGroup } from './budget';

/** A category's saved setting as it stands, the shape Budget › Category settings saves. */
export function categorySetting(category: BudgetCategory): BudgetCategorySetting {
 return { category_key: category.key, budget_type: category.type, group_name: category.group === defaultGroups[category.type] ? null : category.group, rollover: category.rollover, rollover_start: category.rollover ? category.rolloverStart : null, excluded: category.excluded,
  rollover_balance: category.rollover ? category.rolloverBalance : 0, rollover_currency: category.rollover && category.rolloverBalance ? category.rolloverCurrency : null, rollover_negative: category.rolloverNegative };
}

/** The setting that puts a spending category into another group, as choosing that group in Category settings would:
 * a group that only follows the type is not stored. In flex mode the groups are the types, so the type changes and a
 * custom group stays. Null when nothing would change: income, the same group, or a different direction. */
export function moveToGroup(category: BudgetCategory, group: Pick<BudgetGroup, 'name' | 'direction' | 'type'>): BudgetCategorySetting | null {
 if (category.direction !== 'expense' || group.direction !== 'expense') return null;
 const setting = categorySetting(category);
 if (group.type) {
  if (group.type === category.type) return null;
  return { ...setting, budget_type: group.type, group_name: setting.group_name === defaultGroups[group.type] ? null : setting.group_name };
 }
 if (group.name === category.group) return null;
 return { ...setting, group_name: group.name === defaultGroups[category.type] ? null : group.name };
}
