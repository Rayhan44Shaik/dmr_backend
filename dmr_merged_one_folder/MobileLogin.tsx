import { useState, type FormEvent } from "react";
import { Eye, EyeOff, LoaderCircle, LockKeyhole, ShieldCheck, UserRound } from "lucide-react";
import BrandMark from "../../../ui/BrandMark";
import { useMobileAuth } from "./mobileAuthContext";
import { asMobileApiError } from "../services/mobileApiClient";

export default function MobileLogin() {
  const { login } = useMobileAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await login(username, password);
    } catch (caught) {
      setError(asMobileApiError(caught).message);
    } finally {
      setBusy(false);
    }
  };

  const inputClass =
    "h-12 w-full rounded-xl border border-slate-200 bg-white pl-11 pr-11 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20";

  return (
    <main className="mobile-trip-app flex min-h-dvh items-center justify-center bg-slate-100 px-5 py-10">
      <section className="w-full max-w-sm overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-card-lg">
        <div className="bg-gradient-to-br from-emerald-800 via-emerald-900 to-emerald-950 px-6 py-7 text-white">
          <div className="flex items-center gap-3">
            <BrandMark size="lg" />
            <div>
              <h1 className="text-lg font-extrabold tracking-tight">DMR Poultries</h1>
              <p className="text-xs font-medium text-emerald-200/80">Supervisor Trip Entry</p>
            </div>
          </div>
          <div className="mt-6 flex items-start gap-3 rounded-2xl bg-white/10 p-3.5 ring-1 ring-inset ring-white/10">
            <ShieldCheck size={19} className="mt-0.5 shrink-0 text-emerald-300" />
            <p className="text-xs leading-relaxed text-emerald-50/90">
              Sign in with your individual mobile supervisor account. Shared accounts are not permitted.
            </p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-4 p-6">
          <div>
            <label htmlFor="mobile-username" className="mb-1.5 block text-xs font-bold text-slate-600">
              Supervisor username
            </label>
            <div className="relative">
              <UserRound size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                id="mobile-username"
                autoComplete="username"
                autoCapitalize="none"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className={inputClass}
                placeholder="Enter username"
                required
              />
            </div>
          </div>
          <div>
            <label htmlFor="mobile-password" className="mb-1.5 block text-xs font-bold text-slate-600">
              Password
            </label>
            <div className="relative">
              <LockKeyhole size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                id="mobile-password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className={inputClass}
                placeholder="Enter password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((shown) => !shown)}
                className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </div>

          {error && (
            <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-semibold leading-relaxed text-rose-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy || !username.trim() || !password}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-extrabold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? <LoaderCircle size={17} className="animate-spin" /> : <ShieldCheck size={17} />}
            {busy ? "Authenticating…" : "Secure sign in"}
          </button>
          <p className="text-center text-[11px] leading-relaxed text-slate-400">
            Credentials are verified by the office backend and are never stored as plaintext on this device.
          </p>
          {import.meta.env.DEV && (
            <p className="rounded-xl bg-slate-50 px-3 py-2 text-center text-[11px] leading-relaxed text-slate-500">
              Local development login: <span className="font-bold text-slate-700">RuhullaShaik</span>
              {" / "}
              <span className="font-bold text-slate-700">Supervisor@123</span>
            </p>
          )}
        </form>
      </section>
    </main>
  );
}
