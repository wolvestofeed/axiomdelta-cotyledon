/**
 * The toolbar's groups, in the order they sit left to right:
 *   scope   what the page is about — crop plan, day, month or period, scenario A and B, a filter
 *   view    how it is shown — run / day / horizon, precedence on or off, month / quarter / year
 *   action  downloads and page-level buttons
 * A plain module: the server layout renders the slots and the client `PageControls`
 * fills them, so the names live where both can read them as values.
 */
export type PageControlGroup = 'scope' | 'view' | 'action';
export const PAGE_CONTROL_GROUPS: readonly PageControlGroup[] = ['scope', 'view', 'action'];
export const pageControlsId = (group: PageControlGroup) => `farm-page-controls-${group}`;
