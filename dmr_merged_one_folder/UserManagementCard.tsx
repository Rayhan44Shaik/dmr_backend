import React from "react";
import { Card, Button } from "../common";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { getUsers } from "../../services";

export const UserManagementCard: React.FC = () => {
  const users = getUsers();
  return (
    <Card className="flex flex-col gap-6">
      <div className="flex items-center justify-between border-b border-slate-100 pb-4 flex-wrap gap-3">
        <span className="text-base font-bold text-slate-800">User Management</span>
        <Button className="text-xs px-4 py-2"><Plus size={16} /> Add New User</Button>
      </div>
      <div className="overflow-x-auto"><table className="w-full text-xs text-left border-collapse"><thead className="text-[10px] font-bold text-slate-500 uppercase bg-slate-50 border-b border-slate-100"><tr><th className="py-3 px-3 w-8 text-center">#</th><th className="py-3 px-3">Photo</th><th className="py-3 px-3">Full Name</th><th className="py-3 px-3">Username</th><th className="py-3 px-3">Department</th><th className="py-3 px-3">Role</th><th className="py-3 px-3 text-center">Status</th><th className="py-3 px-3">Last Login</th><th className="py-3 px-3 text-center">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{users.map(u => (<tr key={u.id} className="hover:bg-slate-50/60"><td className="py-3 px-3 text-center font-bold text-slate-500">{u.id}</td><td className="py-3 px-3"><div className="h-7 w-7 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 text-[10px]">👤</div></td><td className="py-3 px-3 font-medium text-slate-700">{u.name}</td><td className="py-3 px-3 text-slate-500">{u.username}</td><td className="py-3 px-3 text-slate-500">{u.department}</td><td className="py-3 px-3 text-slate-600">{u.role}</td><td className="py-3 px-3 text-center"><span className="inline-flex items-center gap-1.5 bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> {u.status}</span></td><td className="py-3 px-3 text-slate-500">{u.lastLogin}</td><td className="py-3 px-3 text-center flex justify-center gap-2"><button className="text-[#6c5ce7] hover:text-[#5a4bd1]"><Pencil size={14} /></button><button className="text-rose-500 hover:text-rose-700"><Trash2 size={14} /></button></td></tr>))}</tbody></table></div>
      <div className="flex justify-end pt-2"><div className="flex items-center gap-1 border border-slate-200 rounded-lg p-1 bg-slate-50"><button className="w-7 h-7 rounded bg-[#6c5ce7] text-white text-xs font-bold flex items-center justify-center shadow-sm">1</button><button className="w-7 h-7 rounded hover:bg-slate-200 text-slate-600 text-xs font-bold flex items-center justify-center">2</button><button className="w-7 h-7 rounded hover:bg-slate-200 text-slate-600 text-xs font-bold flex items-center justify-center">3</button></div></div>
    </Card>
  );
};