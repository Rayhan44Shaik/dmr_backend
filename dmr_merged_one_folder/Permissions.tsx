export default function Permissions() {
  const modules = ["Dashboard", "Operations", "Accounts", "Reports", "Settings"];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between border-b border-slate-100 pb-4">
        <div>
          <h3 className="text-base font-bold text-slate-800">Permissions Overview</h3>
          <p className="text-xs text-slate-400">Configure access levels per user role.</p>
        </div>
        <div className="w-40">
          <select className="w-full rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold outline-none focus:border-indigo-600">
            <option>Supervisor</option>
            <option>Administrator</option>
          </select>
        </div>
      </div>

      <div className="overflow-x-auto border border-slate-200/80 rounded-2xl">
        <table className="w-full text-xs text-left">
          <thead className="text-[10px] font-bold text-slate-500 uppercase bg-slate-50 border-b border-slate-100">
            <tr>
              <th className="py-3 px-4">Module</th>
              <th className="py-3 px-3 text-center">View</th>
              <th className="py-3 px-3 text-center">Add</th>
              <th className="py-3 px-3 text-center">Edit</th>
              <th className="py-3 px-3 text-center">Delete</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {modules.map((mod) => (
              <tr key={mod} className="hover:bg-slate-50/50">
                <td className="py-3 px-4 font-semibold text-slate-800">{mod}</td>
                {["view", "add", "edit", "delete"].map((perm) => (
                  <td key={perm} className="py-3 px-3 text-center">
                    <input type="checkbox" defaultChecked={perm !== "delete"} className="rounded border-slate-300 text-indigo-600" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pt-4 border-t border-slate-100 flex justify-end">
        <button className="px-5 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700">Save Permissions</button>
      </div>
    </div>
  );
}