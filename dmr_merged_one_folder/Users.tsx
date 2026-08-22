import { Pencil, Trash2, Plus } from "lucide-react";
import { getUsers } from "../services";

export default function Users() {
  const users = getUsers();

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between border-b border-slate-100 pb-4">
        <div>
          <h3 className="text-base font-bold text-slate-800">User Management</h3>
          <p className="text-xs text-slate-400">Manage all registered ERP system users and roles.</p>
        </div>
        <button className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl">
          <Plus size={15} /> Add User
        </button>
      </div>

      <div className="overflow-x-auto border border-slate-200/80 rounded-2xl">
        <table className="w-full text-xs text-left">
          <thead className="text-[10px] font-bold text-slate-500 uppercase bg-slate-50 border-b border-slate-100">
            <tr>
              <th className="py-3 px-3 text-center">#</th>
              <th className="py-3 px-3">Name</th>
              <th className="py-3 px-3">Username</th>
              <th className="py-3 px-3">Department</th>
              <th className="py-3 px-3">Role</th>
              <th className="py-3 px-3 text-center">Status</th>
              <th className="py-3 px-3 text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-slate-50/50">
                <td className="py-3 px-3 text-center text-slate-400 font-bold">{u.id}</td>
                <td className="py-3 px-3 font-semibold text-slate-800">{u.name}</td>
                <td className="py-3 px-3 text-slate-500">{u.username}</td>
                <td className="py-3 px-3 text-slate-500">{u.department}</td>
                <td className="py-3 px-3 text-slate-600">{u.role}</td>
                <td className="py-3 px-3 text-center">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold text-[10px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> {u.status}
                  </span>
                </td>
                <td className="py-3 px-3 text-center flex justify-center gap-2">
                  <button className="text-indigo-600 hover:text-indigo-800"><Pencil size={14} /></button>
                  <button className="text-rose-500 hover:text-rose-700"><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}