import React from "react";
import { Card } from "../common";

export const AboutCard: React.FC = () => (
  <Card className="flex flex-col gap-6 text-center">
    <div className="flex flex-col items-center pb-4 border-b border-slate-100">
      <div className="text-7xl mb-4">🐔</div>
      <h3 className="text-xl font-bold text-slate-800">DMR Poultries ERP</h3>
      <p className="text-xs text-slate-500 max-w-xs mx-auto mt-1">A complete ERP solution for poultry logistics operations.</p>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-6 text-xs text-left max-w-sm mx-auto">
      <div className="flex justify-between border-b border-slate-100 pb-1"><span className="text-slate-500">Software Version</span><span className="font-medium">1.0.0</span></div>
      <div className="flex justify-between border-b border-slate-100 pb-1"><span className="text-slate-500">Build Number</span><span className="font-medium">2026.05.28.01</span></div>
      <div className="flex justify-between border-b border-slate-100 pb-1"><span className="text-slate-500">Database Version</span><span className="font-medium">PostgreSQL 15.3</span></div>
      <div className="flex justify-between border-b border-slate-100 pb-1"><span className="text-slate-500">Last Update</span><span className="font-medium">28-May-2026</span></div>
      <div className="flex justify-between border-b border-slate-100 pb-1"><span className="text-slate-500">Developer</span><span className="font-medium">DMR Solutions</span></div>
      <div className="flex justify-between border-b border-slate-100 pb-1"><span className="text-slate-500">Support Email</span><span className="font-medium text-[#6c5ce7]">support@dmrpoultries.com</span></div>
    </div>
  </Card>
);