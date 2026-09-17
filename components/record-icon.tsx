import type { CSSProperties } from 'react';
import { BadgeDollarSign, BanknoteArrowDown, BanknoteArrowUp, CirclePlus, CreditCard, HandHeart, House, HousePlus, KeyRound, ReceiptText, ShoppingBasket, type LucideIcon } from 'lucide-react';
import { AssetIcon } from '@/components/asset-icon';
import { categoryHue } from '@/lib/category-colors';
import type { Entry, Kind } from '@/lib/finance';

// Keep lending and borrowing visually distinct, even without category color.
const recordSymbols = {
 'Money lent': BanknoteArrowUp,
 Mortgage: House,
 Loan: BanknoteArrowDown,
 Debt: CreditCard,
 Salary: BadgeDollarSign,
 'Rent income': HousePlus,
 'Other income': CirclePlus,
 'Rent expense': KeyRound,
 'Living expense': ShoppingBasket,
 Charity: HandHeart,
 'Other expense': ReceiptText,
} satisfies Partial<Record<Kind, LucideIcon>>;

export function RecordIcon({ record }: { record: Pick<Entry, 'kind' | 'name'> }) {
 const Icon = recordSymbols[record.kind as keyof typeof recordSymbols];
 return <span className="record-icon category-record-icon" style={{ '--category-hue': categoryHue(record.kind) } as CSSProperties} aria-hidden="true">
  {Icon ? <Icon strokeWidth={1.7} /> : <AssetIcon record={record} />}
 </span>;
}
