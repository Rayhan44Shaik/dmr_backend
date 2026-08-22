import React, { useState } from "react";
import { Card, Button, Input } from "../common";
import { Lock, ShieldCheck, Eye, EyeOff } from "lucide-react";

export const PasswordCard: React.FC = () => {
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  return (
    <Card className="flex flex-col gap-6">
      <div className="flex items-center justify-between border-b border-slate-100 pb-4">
        <span className="text-base font-bold text-slate-800">Change Password</span>
        <span className="text-[10px] text-slate-400">Update your account password</span>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        <div className="flex items-center justify-center w-full md:w-1/3 relative text-[#6c5ce7]">
          <Lock size={80} className="opacity-90 drop-shadow-lg" />
          <div className="absolute -right-2 -bottom-2 bg-white rounded-full p-1 shadow-md border border-slate-200">
            <ShieldCheck size={28} className="text-emerald-500" />
          </div>
        </div>

        <div className="flex-1 flex flex-col gap-4">
          {/* Current Password */}
          <div className="relative">
            <Input
              type={showCurrent ? "text" : "password"}
              label="Current Password"
              placeholder="Enter current password"
            />
            <button
              type="button"
              onClick={() => setShowCurrent(!showCurrent)}
              className="absolute right-3 top-9 text-slate-400 hover:text-slate-600 transition-colors"
            >
              {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          {/* New Password */}
          <div>
            <div className="relative">
              <Input
                type={showNew ? "text" : "password"}
                label="New Password"
                placeholder="Enter new password"
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-3 top-9 text-slate-400 hover:text-slate-600 transition-colors"
              >
                {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                <div className="h-full w-[75%] bg-emerald-500 rounded-full"></div>
              </div>
              <span className="text-[10px] font-bold text-emerald-600">Strong</span>
            </div>
          </div>

          {/* Confirm New Password */}
          <div className="relative">
            <Input
              type={showConfirm ? "text" : "password"}
              label="Confirm New Password"
              placeholder="Confirm new password"
            />
            <button
              type="button"
              onClick={() => setShowConfirm(!showConfirm)}
              className="absolute right-3 top-9 text-slate-400 hover:text-slate-600 transition-colors"
            >
              {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>
      </div>

      <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
        <Button variant="secondary">Cancel</Button>
        <Button className="bg-emerald-600 hover:bg-emerald-700 text-white transition-colors">
          Update Password
        </Button>
      </div>
    </Card>
  );
};