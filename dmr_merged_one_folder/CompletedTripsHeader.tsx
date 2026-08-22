import { ClipboardCheck } from "lucide-react";

export default function CompletedTripsHeader() {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
      <div className="flex items-center justify-between px-6 py-5">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center">
            <ClipboardCheck className="text-orange-600" size={28} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">
              Completed Trips Waiting for Rate Entry
            </h2>
            <p className="text-sm text-slate-500">
              Completed operational trips awaiting Accounts rate approval.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}