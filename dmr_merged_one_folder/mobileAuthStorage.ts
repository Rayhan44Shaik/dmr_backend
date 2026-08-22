import localforage from "localforage";

export type MobileSupervisorProfile = {
  accountId: string;
  employeeId: number;
  employeeName: string;
  username: string;
  role: string;
  department: string;
};

export type StoredMobileSession = {
  token: string;
  expiresAt: string;
  supervisor: MobileSupervisorProfile;
};

const authStore = localforage.createInstance({
  name: "dmr-poultries",
  storeName: "supervisor_mobile_auth",
  description: "Opaque, backend-issued Supervisor Mobile session",
});

const SESSION_KEY = "active-session";

function validSession(value: unknown): value is StoredMobileSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<StoredMobileSession>;
  return Boolean(
    session.token &&
      session.expiresAt &&
      session.supervisor?.accountId &&
      session.supervisor?.employeeId &&
      session.supervisor?.employeeName
  );
}

export async function loadMobileSession(): Promise<StoredMobileSession | null> {
  const value = await authStore.getItem<unknown>(SESSION_KEY);
  if (!validSession(value)) return null;
  if (new Date(value.expiresAt).getTime() <= Date.now()) {
    await authStore.removeItem(SESSION_KEY);
    return null;
  }
  return value;
}

export async function saveMobileSession(session: StoredMobileSession): Promise<void> {
  await authStore.setItem(SESSION_KEY, session);
}

export async function clearMobileSession(): Promise<void> {
  await authStore.removeItem(SESSION_KEY);
}
