/** Toggle only cards sharing the activated card's current grid row. */
export function toggleAssetDetailsRow(event: { currentTarget: HTMLElement; preventDefault(): void }) {
 const details = event.currentTarget.closest<HTMLDetailsElement>('details');
 const card = details?.closest<HTMLElement>('.asset-card');
 const grid = card?.parentElement;
 if (!details || !card || !grid?.classList.contains('asset-card-grid')) return;
 event.preventDefault();
 const open = !details.open;
 // Read every position before changing heights. offsetTop ignores hover transforms.
 const row = Array.from(grid.children).filter((sibling): sibling is HTMLElement =>
  sibling instanceof HTMLElement && sibling.classList.contains('asset-card') && sibling.offsetTop === card.offsetTop
 );
 for (const sibling of row) {
  const panel = sibling.querySelector<HTMLDetailsElement>(':scope > .asset-card-details');
  if (panel) panel.open = open;
 }
}
