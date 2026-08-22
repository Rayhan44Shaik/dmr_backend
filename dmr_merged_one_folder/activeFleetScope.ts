/**
 * CURRENT production Fleet Operations scope.
 *
 * ACTIVE tabs fetch, cache, and refresh against PostgreSQL.
 * FASTAG is a customer-facing placeholder only (no data path).
 * DEFERRED modules keep their files in the repo but are not mounted.
 */
export const ACTIVE_FLEET_TABS = [
  'entry',
  'history',
  'permits',
  'emi',
  'analytics',
] as const;

export type ActiveFleetTab = (typeof ACTIVE_FLEET_TABS)[number];

/** Visible in nav as Under Construction — not production data, no APIs. */
export const PLACEHOLDER_FLEET_TABS = ['fastag'] as const;

export type PlaceholderFleetTab = (typeof PLACEHOLDER_FLEET_TABS)[number];

export const VISIBLE_FLEET_TABS = [...ACTIVE_FLEET_TABS, ...PLACEHOLDER_FLEET_TABS] as const;

export type VisibleFleetTab = (typeof VISIBLE_FLEET_TABS)[number];

/** FUTURE/DEFERRED — files preserved; not in live navigation or data path. */
export const DEFERRED_FLEET_TABS = ['dashboard', 'reports', 'expenses'] as const;

export type DeferredFleetTab = (typeof DEFERRED_FLEET_TABS)[number];

export const DEFAULT_FLEET_TAB: ActiveFleetTab = 'entry';

export function isActiveFleetTab(value: string | null | undefined): value is ActiveFleetTab {
  return Boolean(value && (ACTIVE_FLEET_TABS as readonly string[]).includes(value));
}

export function isPlaceholderFleetTab(value: string | null | undefined): value is PlaceholderFleetTab {
  return Boolean(value && (PLACEHOLDER_FLEET_TABS as readonly string[]).includes(value));
}

export function isVisibleFleetTab(value: string | null | undefined): value is VisibleFleetTab {
  return Boolean(value && (VISIBLE_FLEET_TABS as readonly string[]).includes(value));
}

export function isDeferredFleetTab(value: string | null | undefined): value is DeferredFleetTab {
  return Boolean(value && (DEFERRED_FLEET_TABS as readonly string[]).includes(value));
}
