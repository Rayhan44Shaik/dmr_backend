import { useEffect, useState } from "react";
import { Landmark, MapPin, Hash, AtSign, CreditCard } from "lucide-react";
import type { Bank } from "../types/bank";
import { useSafeNotification } from "../../../../hooks/useSafeNotification";

type BankFormProps = {
  bank?: Bank | null;
  onSave: (bank: any) => void;
  onCancel: () => void;
  isSaving?: boolean;
};

function BankForm({ bank, onSave, onCancel, isSaving = false }: BankFormProps) {
  const { showNotification } = useSafeNotification();
  const [bankName, setBankName] = useState("");
  const [branch, setBranch] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [ifscCode, setIfscCode] = useState("");
  const [upiId, setUpiId] = useState("");
  const [status, setStatus] = useState<"Active" | "Inactive">("Active");

  useEffect(() => {
    if (bank) {
      setBankName(bank.bankName);
      setBranch(bank.branch);
      setAccountNumber(bank.accountNumber);
      setIfscCode(bank.ifscCode);
      setUpiId(bank.upiId ?? "");
      setStatus(bank.status);
    } else {
      setBankName("");
      setBranch("");
      setAccountNumber("");
      setIfscCode("");
      setUpiId("");
      setStatus("Active");
    }
  }, [bank]);

  const handleSubmit = () => {
    if (isSaving) return;

    // Required fields
    if (!bankName || !branch || !accountNumber || !ifscCode) {
      showNotification("Please fill all required fields.", "error");
      return;
    }

    // Account number: accept alphanumeric, at least 6 characters
    if (!/^[A-Za-z0-9]{6,20}$/.test(accountNumber)) {
      showNotification("Account Number must be 6-20 alphanumeric characters.", "error");
      return;
    }

    // IFSC: 11 characters, first 4 letters, 5th is 0, last 6 alphanumeric
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifscCode.toUpperCase())) {
      showNotification("IFSC must be 11 characters (e.g., SBIN0012345).", "error");
      return;
    }

    // UPI: optional, but if provided, must be in valid format (username@bank)
    if (upiId && !/^[a-zA-Z0-9._-]+@[a-zA-Z0-9]+$/.test(upiId)) {
      showNotification("UPI ID must be in format username@bank (e.g., user@hdfc).", "error");
      return;
    }

    onSave({
      bankName,
      branch,
      accountNumber,
      ifscCode: ifscCode.toUpperCase(),
      upiId,
      status,
    });
  };

  return (
    <div className="flex flex-col w-full bg-white rounded-xl">
      {/* Header Section */}
      <div className="flex items-center justify-between px-6 py-5 bg-slate-50 border-b border-slate-100 rounded-t-xl">
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center w-12 h-12 bg-blue-100 text-blue-600 rounded-xl">
            <Landmark size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">
              {bank ? "Edit Bank" : "Add Bank"}
            </h2>
            <p className="text-sm text-slate-500">Fill in the details</p>
          </div>
        </div>

        {/* Status Toggle */}
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-slate-700">Status</span>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={status === "Active"}
              onChange={(e) => setStatus(e.target.checked ? "Active" : "Inactive")}
              disabled={isSaving}
            />
            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
          </label>
          <span
            className={`text-sm font-medium ${
              status === "Active" ? "text-emerald-600" : "text-slate-500"
            }`}
          >
            {status}
          </span>
        </div>
      </div>

      {/* Body Section */}
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block mb-1.5 text-sm font-medium text-slate-700">
              Bank Name <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Landmark className="h-5 w-5 text-slate-400" />
              </div>
              <input
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="e.g., State Bank of India"
                className="w-full border border-slate-200 rounded-lg pl-10 p-2.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all"
                disabled={isSaving}
              />
            </div>
          </div>

          <div>
            <label className="block mb-1.5 text-sm font-medium text-slate-700">
              Branch <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <MapPin className="h-5 w-5 text-slate-400" />
              </div>
              <input
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                placeholder="e.g., Guntur Main"
                className="w-full border border-slate-200 rounded-lg pl-10 p-2.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all"
                disabled={isSaving}
              />
            </div>
          </div>

          <div>
            <label className="block mb-1.5 text-sm font-medium text-slate-700">
              Account Number <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <CreditCard className="h-5 w-5 text-slate-400" />
              </div>
              <input
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value.toUpperCase())}
                placeholder="6-20 alphanumeric"
                className="w-full border border-slate-200 rounded-lg pl-10 p-2.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all"
                disabled={isSaving}
              />
            </div>
          </div>

          <div>
            <label className="block mb-1.5 text-sm font-medium text-slate-700">
              IFSC Code <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Hash className="h-5 w-5 text-slate-400" />
              </div>
              <input
                value={ifscCode}
                onChange={(e) => setIfscCode(e.target.value.toUpperCase())}
                placeholder="e.g., SBIN0012345"
                className="w-full border border-slate-200 rounded-lg pl-10 p-2.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all"
                disabled={isSaving}
              />
            </div>
          </div>

          <div>
            <label className="block mb-1.5 text-sm font-medium text-slate-700">
              UPI ID <span className="text-slate-400 text-xs font-normal ml-1">(Optional)</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <AtSign className="h-5 w-5 text-slate-400" />
              </div>
              <input
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                placeholder="e.g., user@hdfc"
                className="w-full border border-slate-200 rounded-lg pl-10 p-2.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all"
                disabled={isSaving}
              />
            </div>
          </div>
        </div>

        {/* Footer Section */}
        <div className="flex justify-end gap-3 pt-6 border-t mt-6">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="px-6 py-2.5 border rounded-lg text-sm font-medium hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSaving}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
          >
            {isSaving && (
              <svg
                className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            )}
            {isSaving ? "Saving..." : bank ? "Update Bank" : "Save Bank"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default BankForm;