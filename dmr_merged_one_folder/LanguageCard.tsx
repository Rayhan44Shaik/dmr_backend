import React from "react";
import { Card, Button } from "../common";

export const LanguageCard: React.FC = () => (
  <Card className="flex flex-col gap-6">
    <div className="flex items-center justify-between border-b border-slate-100 pb-4"><span className="text-base font-bold text-slate-800">Language Settings</span><span className="text-[10px] text-slate-400">Select your preferred language</span></div>
    <div className="flex flex-col md:flex-row gap-8 items-center">
      <div className="text-8xl leading-none">🌍</div>
      <div className="flex-1 w-full space-y-4">
        <div><label className="text-xs font-semibold text-slate-600 mb-1 block">Default Language</label><select className="w-full rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-2.5 text-sm font-medium text-slate-700 outline-none focus:border-[#6c5ce7]"><option>English</option><option>Telugu</option></select></div>
        <div><label className="text-xs font-semibold text-slate-600 mb-1 block">Available Languages</label><div className="flex flex-col gap-1.5"><label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" defaultChecked className="w-4 h-4 rounded border-slate-300 text-[#6c5ce7] focus:ring-[#6c5ce7]" /> English</label><label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" defaultChecked className="w-4 h-4 rounded border-slate-300 text-[#6c5ce7] focus:ring-[#6c5ce7]" /> Français (Telugu)</label><label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-[#6c5ce7] focus:ring-[#6c5ce7]" /> தமிழ் (Tamil)</label></div></div>
      </div>
    </div>
    <div className="pt-4 border-t border-slate-100 flex justify-end gap-3"><Button variant="secondary">Reset</Button><Button>Save Language</Button></div>
  </Card>
);