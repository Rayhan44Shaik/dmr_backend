import { Pencil, Trash2 } from "lucide-react";
import type { Employee } from "../types/employee";
import { usePendingDelete } from "../../../../hooks/usePendingDelete";
import { PendingDeleteNotification } from "../../../../components/common/PendingDeleteNotification";

type EmployeeTableProps = {
  employees: Employee[];
  onEdit: (employee: Employee) => void;
  onDelete: (id: number) => void;
};

function EmployeeTable({ employees, onEdit, onDelete }: EmployeeTableProps) {
  const { requestDelete, cancel, pendingItems } = usePendingDelete(onDelete);
  const formatSalary = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="overflow-x-auto rounded-xl bg-white shadow-sm border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200">
        <thead className="bg-slate-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">EMP NO</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">EMPLOYEE NAME</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">DEPARTMENT</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">PHONE</th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500">SALARY</th>
            <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-slate-500">STATUS</th>
            <th className="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-slate-500">ACTIONS</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 bg-white">
          {[...employees]
            .sort((a, b) => (a.employeeNo > b.employeeNo ? 1 : -1))
            .map((emp) => (
            <tr key={emp.id} className="hover:bg-slate-50 transition-colors">
              <td className="px-4 py-3 text-sm text-slate-600">{emp.employeeNo}</td>
              <td className="px-4 py-3 text-sm font-medium text-slate-800">{emp.employeeName}</td>
              <td className="px-4 py-3 text-sm text-slate-600">{emp.department}</td>
              <td className="px-4 py-3 text-sm text-slate-600">{emp.phoneNumber}</td>
              <td className="px-4 py-3 text-right text-sm font-medium text-slate-700">
                {formatSalary(emp.salary)}
              </td>
              <td className="px-4 py-3 text-center">
                <span
                  className={`inline-block rounded-full px-3 py-0.5 text-xs font-medium ${
                    emp.status === "Active"
                      ? "bg-green-100 text-green-700"
                      : "bg-red-100 text-red-700"
                  }`}
                >
                  {emp.status}
                </span>
              </td>
              <td className="px-4 py-3 text-center">
                <div className="flex items-center justify-center gap-2">
                  <button
                    onClick={() => onEdit(emp)}
                    className="rounded p-1 text-blue-600 hover:bg-blue-50 transition-colors"
                    title="Edit"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => requestDelete(emp.id, { label: `Deleting Employee "${emp.employeeName}"` })}
                    className="rounded p-1 text-red-600 hover:bg-red-50 transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {employees.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-6 text-center text-sm text-slate-500">
                No employees found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <PendingDeleteNotification items={pendingItems} onCancel={cancel} />
    </div>
  );
}

export default EmployeeTable;