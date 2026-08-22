import { Sun, Moon } from "lucide-react";

export default function Appearance() {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="border-b border-slate-100 pb-4">
        <h3 className="text-lg font-bold text-slate-800">Appearance Settings</h3>
        <p className="text-xs text-slate-400">Customize how your dashboard looks and feels.</p>
      </div>

      <div className="space-y-6">
        <div>
          <label className="text-xs font-semibold text-slate-600 block mb-3">Theme Selection</label>
          <div className="flex gap-4">
            <div className="flex items-center justify-center gap-2 border-2 border-indigo-600 bg-indigo-50/50 rounded-2xl py-3 w-32 cursor-pointer text-xs font-bold text-indigo-700">
              <Sun size={18} /> Light Mode
            </div>
            <div className="flex items-center justify-center gap-2 border border-slate-200 rounded-2xl py-3 w-32 cursor-pointer text-xs font-medium text-slate-600 hover:bg-slate-50">
              <Moon size={18} /> Dark Mode
            </div>
          </div>
        </div>
      </div>

      <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
        <button className="px-5 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700">Apply Changes</button>
      </div>
    </div>
  );
}