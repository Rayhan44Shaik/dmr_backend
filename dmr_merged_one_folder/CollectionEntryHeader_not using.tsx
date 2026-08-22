import {

  CalendarDays,

  Wallet,

  Clock3

} from "lucide-react";

interface Props {

  pendingShops: number;

  pendingAmount: number;

  pendingApproval: number;

  today: string;

}

export default function CollectionEntryHeader({

  pendingShops,

  pendingAmount,

  pendingApproval,

  today

}: Props) {

  return (

    <div className="space-y-6">

      {/* =====================================================
          PAGE TITLE
      ====================================================== */}

      <div>

        <h1 className="text-3xl font-bold text-slate-800">

          Collection Entry

        </h1>

        <p className="mt-2 text-slate-500">

          Record shop collections and manage approval workflow.

        </p>

      </div>

      {/* =====================================================
          SUMMARY CARDS
      ====================================================== */}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-4">

        {/* Pending Shops */}

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">

          <div className="flex items-center justify-between">

            <div>

              <p className="text-sm text-slate-500">

                Pending Shops

              </p>

              <h2 className="mt-2 text-3xl font-bold text-slate-800">

                {pendingShops}

              </h2>

            </div>

            <div className="rounded-2xl bg-blue-100 p-3">

              <Wallet

                className="text-blue-700"

                size={24}

              />

            </div>

          </div>

        </div>

        {/* Pending Amount */}

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">

          <div className="flex items-center justify-between">

            <div>

              <p className="text-sm text-slate-500">

                Pending Amount

              </p>

              <h2 className="mt-2 text-3xl font-bold text-red-600">

                ₹ {pendingAmount.toLocaleString()}

              </h2>

            </div>

            <div className="rounded-2xl bg-red-100 p-3">

              <Wallet

                className="text-red-700"

                size={24}

              />

            </div>

          </div>

        </div>

        {/* Approval */}

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">

          <div className="flex items-center justify-between">

            <div>

              <p className="text-sm text-slate-500">

                Approval Required

              </p>

              <h2 className="mt-2 text-3xl font-bold text-orange-600">

                {pendingApproval}

              </h2>

            </div>

            <div className="rounded-2xl bg-orange-100 p-3">

              <Clock3

                className="text-orange-700"

                size={24}

              />

            </div>

          </div>

        </div>

        {/* Today */}

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">

          <div className="flex items-center justify-between">

            <div>

              <p className="text-sm text-slate-500">

                Today

              </p>

              <h2 className="mt-2 text-lg font-bold text-slate-800">

                {today}

              </h2>

            </div>

            <div className="rounded-2xl bg-green-100 p-3">

              <CalendarDays

                className="text-green-700"

                size={24}

              />

            </div>

          </div>

        </div>

      </div>

    </div>

  );

}