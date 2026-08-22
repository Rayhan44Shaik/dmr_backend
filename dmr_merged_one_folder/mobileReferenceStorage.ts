import localforage from "localforage";
import type { MobileBootstrap } from "../services/mobileApiClient";

const store = localforage.createInstance({
  name: "dmr-poultries",
  storeName: "supervisor_mobile_reference",
  description: "Last acknowledged mobile Trip Entry reference data",
});

function key(ownerKey: string): string {
  return `bootstrap:${ownerKey.toLowerCase().replace(/[^a-z0-9_.-]/g, "_")}`;
}

export async function loadCachedBootstrap(ownerKey: string): Promise<MobileBootstrap | null> {
  const value = await store.getItem<unknown>(key(ownerKey));
  if (!value || typeof value !== "object") return null;
  const candidate = value as MobileBootstrap;
  return Array.isArray(candidate.employees) && Array.isArray(candidate.vehicles) ? candidate : null;
}

export async function cacheBootstrap(ownerKey: string, bootstrap: MobileBootstrap): Promise<void> {
  await store.setItem(key(ownerKey), bootstrap);
}
