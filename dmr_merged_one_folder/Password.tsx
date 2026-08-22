import { useState } from "react";
import { Lock, Eye, EyeOff, ShieldCheck } from "lucide-react";

export default function Password() {
  const [showPass, setShowPass] = useState({ current: false, new: false, confirm: false });

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="border-b border-slate-100 pb-4">
        <h3 className="text-lg font-bold text-slate-800">Change Password</h3>
        <p className="text-xs text-slate-400">Update your account password for added security.</p>
      </div>

      <div className="flex flex-col md:flex-row gap-8 items-center">
        <div className="flex items-center justify-center relative text-indigo-600">
          <Lock size={100} className="opacity-90" />
          <ShieldCheck size={32} className="absolute bottom-0 right-0 text-emerald-500 bg-white rounded-full p-0.5" />
        </div>

        <div className="flex-1 w-full space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Current Password</label>
            <div className="relative">
              <input type={showPass.current ? "text" : "password"} className="w-full rounded-xl border border-slate-200 px-3.5 py-2 pr-10 text-xs outline-none focus:border-indigo-600" />
              <button type="button" onClick={() => setShowPass((p) => ({ ...p, current: !p.current }))} className="absolute right-3 top-2.5 text-slate-400">
                {showPass.current ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">New Password</label>
            <div className="relative">
              <input type={showPass.new ? "text" : "password"} className="w-full rounded-xl border border-slate-200 px-3.5 py-2 pr-10 text-xs outline-none focus:border-indigo-600" />
              <button type="button" onClick={() => setShowPass((p) => ({ ...p, new: !p.new }))} className="absolute right-3 top-2.5 text-slate-400">
                {showPass.new ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Confirm New Password</label>
            <div className="relative">
              <input type={showPass.confirm ? "text" : "password"} className="w-full rounded-xl border border-slate-200 px-3.5 py-2 pr-10 text-xs outline-none focus:border-indigo-600" />
              <button type="button" onClick={() => setShowPass((p) => ({ ...p, confirm: !p.confirm }))} className="absolute right-3 top-2.5 text-slate-400">
                {showPass.confirm ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
        <button className="px-5 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700">Update Password</button>
      </div>
    </div>
  );
}