/**
 * Presentation foundation: the pure UI vocabulary every workspace page is built from.
 *
 * Everything here takes props and renders markup. A member may read the language context
 * and the shared formatters, but never workspace state, data hooks or the network; that is
 * what lets `tests/presentation-foundation.mjs` render each piece on its own.
 * Import members by file (`@/components/presentation-foundation/stat-tile`) so tests can
 * substitute one piece at a time; this index is the module's table of contents.
 */
export { PageHeader } from './page-header';
export { TopBarSlotProvider, useTopBarSlot } from './top-bar-slot';
export { StatTile, StatTiles, type StatTone } from './stat-tile';
export { PanelTitle } from './panel-title';
export { InfoHint } from './info-hint';
export { Count } from './count';
export { EmptyState } from './empty-state';
export { InlineError } from './inline-error';
export { ResourceState } from './resource-state';
export { LoadingPlaceholder, PageSkeleton, WorkspaceSkeleton, ChartSkeleton, StatTilesSkeleton, PanelSkeleton, CashflowPreviewSkeleton } from './loading-placeholder';
export { Segmented, type SegmentedOption } from './segmented';
export { RowMenu, type RowMenuItem } from './row-menu';
export { AssetCard } from './asset-card';
export { AssetIcon } from './asset-icon';
export { RecordIcon } from './record-icon';
export { CategoryBadge } from './category-badge';
export { CategoryIcon } from './category-icon';
export { BusinessMark } from './business-mark';
export { BusinessFilter, type BusinessOption } from './business-filter';
export { TagChip } from './tag-chip';
export { PersonAvatar, OwnerAvatar } from './person-avatar';
export { OwnerFilter, type OwnerOption } from './owner-filter';
export { Brand } from './brand';
export { DrawerLink } from './drawer-link';
export { PartialTotal } from './partial-total';
export { CurrencyValue } from './currency-value';
export { CurrencySelect } from './currency-select';
export { FormattedNumberInput } from './formatted-number-input';
export { DatePicker } from './date-picker';
export { AmountCurrencyFields } from './amount-currency-fields';
export { ScheduleFields } from './schedule-fields';
export { ExchangeRatePreview } from './exchange-rate-preview';
export { FormFooter } from './form-footer';
export { Pagination } from './pagination';
export { ConfirmDialog } from './confirm-dialog';
export { ErrorPopup } from './error-popup';
export { SortableList, SortableItem, sortableAccessibility, useSortableSensors } from './sortable';
export { signTone } from './tone';
