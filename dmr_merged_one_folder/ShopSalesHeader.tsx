import { Store } from "lucide-react";

interface Props {

  totalRecords: number;

}

export default function ShopSalesHeader({

  totalRecords

}: Props) {

  return (

    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-8 py-7">

      <div className="flex items-center justify-between">

        <div className="flex items-center gap-5">

          <div className="h-16 w-16 rounded-2xl bg-orange-100 flex items-center justify-center">

            <Store

              size={34}

              className="text-orange-600"

            />

          </div>

          <div>

            <h1 className="text-4xl font-bold text-slate-800">

              Shop Sales

            </h1>

            <p className="text-slate-500 mt-2">

              Manage sales after completed vehicle trips

            </p>

          </div>

        </div>

        <div className="text-right">

          <p className="text-sm text-slate-500">

            Total Sale Entries

          </p>

          <p className="text-3xl font-bold text-green-700">

            {totalRecords}

          </p>

        </div>

      </div>

    </div>

  );

}