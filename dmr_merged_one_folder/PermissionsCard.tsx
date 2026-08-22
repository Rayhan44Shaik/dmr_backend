import React from "react";
import { Card, Button, Select } from "../common";

export const PermissionsCard: React.FC = () => {
  const modules = ["Dashboard", "Operations", "Accounts", "Reports", "Settings"];
  return (
    <Card className="flex flex-col gap-6">
      <div className="flex items-center justify-between border-b border-slate-100 pb-4 flex-wrap gap-3">
        <span className="text-base font-bold text-slate-800">Permissions Overview</span>
        {/* FIXED: Removed className="w-40" here. The parent flex will handle width, or you can wrap it in a div */}
        <div className="w-40">
           <Select label="Role" options={["Supervisor"]} value="Supervisor" />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left border-collapse">
          <thead className="text-[10px] font-bold text-slate-500 uppercase bg-slate-50 border-b border-slate-100">
            <tr>
              <th className="py-3 px-3">Module</th>
              <th className="py-3 px-3 text-center w-16">View</th>
              <th className="py-3 px-3 text-center w-16">Add</th>
              <th className="py-3 px-3 text-center w-16">Edit</th>
              <th className="py-3 px-3 text-center w-16">Delete</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {modules.map((mod, idx) => (
              <tr key={idx} className="hover:bg-slate-50/50">
                <td className="py-3 px-3 font-medium text-slate-700">{mod}</td>
                {["View", "Add", "Edit", "Delete"].map(perm => (
                  <td key={`${mod}-${perm}`} className="py-3 px-3 text-center">
                    <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-[#6c5ce7] focus:ring-[#6c5ce7] cursor-pointer" defaultChecked={perm !== "Add"} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
        <Button variant="secondary">Cancel</Button>
        <Button>Save Permissions</Button>
      </div>
    </Card>
  );
};