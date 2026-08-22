export default function About() {
  return (
    <div className="max-w-xl mx-auto text-center space-y-6 pt-4">
      <div className="space-y-2">
        <div className="text-7xl">🐔</div>
        <h2 className="text-xl font-bold text-slate-800">DMR Poultries ERP</h2>
        <p className="text-xs text-slate-500 max-w-xs mx-auto">Complete management software for poultry operations, logistics, and accounts.</p>
      </div>

      <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 text-xs space-y-2 text-left">
        <div className="flex justify-between border-b border-slate-200/60 pb-1.5"><span className="text-slate-500">Software Version</span><span className="font-semibold text-slate-800">1.0.0</span></div>
        <div className="flex justify-between border-b border-slate-200/60 pb-1.5"><span className="text-slate-500">Build Number</span><span className="font-semibold text-slate-800">2026.05.28.01</span></div>
        <div className="flex justify-between border-b border-slate-200/60 pb-1.5"><span className="text-slate-500">Database Engine</span><span className="font-semibold text-slate-800">PostgreSQL 15.3</span></div>
        <div className="flex justify-between"><span className="text-slate-500">Developer</span><span className="font-semibold text-indigo-600">DMR Solutions</span></div>
      </div>
    </div>
  );
}