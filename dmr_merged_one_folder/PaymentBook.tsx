import { useState } from "react";
import {
  Users,
  Fuel,
  Wrench,
  UserRound,
  CalendarClock,
  AlertCircle,
  CheckCircle2,
  Clock,
} from "lucide-react";

// Dummy data – replace with API call later
const initialPendingPayments = [
  {
    id: 1,
    category: "Farmer",
    vendor: "Rajesh Kumar",
    description: "Paddy supply – 500 kg",
    amount: 12500,
    dueDate: "2026-07-25",
    status: "pending", // pending | overdue | paid
  },
  {
    id: 2,
    category: "Farmer",
    vendor: "Sundar Pichai",
    description: "Maize – 200 kg",
    amount: 4800,
    dueDate: "2026-07-20",
    status: "overdue",
  },
  {
    id: 3,
    category: "Fuel",
    vendor: "Indian Oil",
    description: "Diesel – 150 L",
    amount: 9750,
    dueDate: "2026-07-28",
    status: "pending",
  },
  {
    id: 4,
    category: "Fuel",
    vendor: "Bharat Petroleum",
    description: "Petrol – 80 L",
    amount: 7200,
    dueDate: "2026-07-15",
    status: "overdue",
  },
  {
    id: 5,
    category: "Vehicle Maintenance",
    vendor: "Tata Motors Service",
    description: "Engine oil change + filters",
    amount: 3500,
    dueDate: "2026-07-30",
    status: "pending",
  },
  {
    id: 6,
    category: "Vehicle Maintenance",
    vendor: "MRF Tyres",
    description: "New tyres for Truck #12",
    amount: 22000,
    dueDate: "2026-08-02",
    status: "pending",
  },
  {
    id: 7,
    category: "Salary",
    vendor: "Staff - 12 employees",
    description: "July 2026 salary",
    amount: 180000,
    dueDate: "2026-08-01",
    status: "pending", // starts pending at month start
  },
];

const statusColors = {
  pending: "bg-yellow-100 text-yellow-800",
  overdue: "bg-red-100 text-red-800",
  paid: "bg-green-100 text-green-800",
};

const statusIcons = {
  pending: <Clock size={14} className="text-yellow-600" />,
  overdue: <AlertCircle size={14} className="text-red-600" />,
  paid: <CheckCircle2 size={14} className="text-green-600" />,
};

export default function PaymentBook() {
  const [payments, setPayments] = useState(initialPendingPayments);
  const [filter, setFilter] = useState("all"); // all, farmer, fuel, maintenance, salary

  const filteredPayments =
    filter === "all"
      ? payments
      : payments.filter((p) => p.category.toLowerCase() === filter);

  const totalPending = payments
    .filter((p) => p.status !== "paid")
    .reduce((sum, p) => sum + p.amount, 0);

  // Function to mark as paid (just for demo)
  const markAsPaid = (id: number) => {
    setPayments((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, status: "paid" } : p
      )
    );
  };

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">Payment Book</h1>
        <div className="text-sm text-slate-500">
          Total Pending:{" "}
          <span className="font-semibold text-red-600">
            ₹{totalPending.toLocaleString()}
          </span>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="mb-6 flex flex-wrap gap-2">
        {["all", "farmer", "fuel", "maintenance", "salary"].map((cat) => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium capitalize transition ${
              filter === cat
                ? "bg-blue-600 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            {cat === "all" ? "All" : cat}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                Category
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                Vendor / Description
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500">
                Amount (₹)
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                Due Date
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                Status
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-500">
                Action
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {filteredPayments.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  No pending payments in this category.
                </td>
              </tr>
            ) : (
              filteredPayments.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="flex items-center gap-2">
                      {p.category === "Farmer" && <Users size={16} className="text-green-600" />}
                      {p.category === "Fuel" && <Fuel size={16} className="text-orange-600" />}
                      {p.category === "Vehicle Maintenance" && <Wrench size={16} className="text-blue-600" />}
                      {p.category === "Salary" && <UserRound size={16} className="text-purple-600" />}
                      <span className="text-sm font-medium">{p.category}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-slate-800">{p.vendor}</div>
                    <div className="text-xs text-slate-500">{p.description}</div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-medium">
                    ₹{p.amount.toLocaleString()}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">
                    <span className="flex items-center gap-1">
                      <CalendarClock size={14} className="text-slate-400" />
                      {p.dueDate}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        statusColors[p.status as keyof typeof statusColors]
                      }`}
                    >
                      {statusIcons[p.status as keyof typeof statusIcons]}
                      {p.status.charAt(0).toUpperCase() + p.status.slice(1)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {p.status !== "paid" ? (
                      <button
                        onClick={() => markAsPaid(p.id)}
                        className="rounded bg-blue-50 px-3 py-1 text-xs font-medium text-blue-600 transition hover:bg-blue-100"
                      >
                        Mark Paid
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">Paid</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Additional info: Salary pending at month start */}
      <div className="mt-4 rounded-lg bg-blue-50 p-4 text-sm text-blue-700">
        <p>
          ⚡ <strong>Reminder:</strong> At the start of each month, a salary pending entry is
          automatically added for all staff. You can mark it as paid once salaries are disbursed.
        </p>
      </div>
    </div>
  );
}