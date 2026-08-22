import { FileSpreadsheet, FileText } from "lucide-react";

type MasterToolbarProps = {
  moduleName: string;
  status: string;
  totalRecords: number;

  onModuleChange: (value: string) => void;
  onStatusChange: (value: string) => void;

  onExcel: () => void;
  onPdf: () => void;
};

function MasterToolbar({

  moduleName,
  status,
  totalRecords,

  onModuleChange,
  onStatusChange,

  onExcel,
  onPdf,

}: MasterToolbarProps) {

  return (

    <div className="bg-white rounded-2xl shadow-sm border p-6">

      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-5">

        {/* Left Side */}

        <div className="flex flex-wrap items-center gap-4">

          <div>

            <label className="block text-sm font-medium text-slate-600 mb-2">

              Select Module

            </label>

            <select

              value={moduleName}

              onChange={(e)=>

                onModuleChange(

                  e.target.value

                )

              }

              className="w-52 border rounded-xl px-4 py-3 focus:ring-2 focus:ring-green-600 outline-none"

            >

              <option>Shops</option>

              <option>Farms</option>

              <option>Vehicles</option>

              <option>Employees</option>

              <option>Banks</option>

              <option>Bird Types</option>

              <option>Routes</option>

            </select>

          </div>

          <div>

            <label className="block text-sm font-medium text-slate-600 mb-2">

              Status

            </label>

            <select

              value={status}

              onChange={(e)=>

                onStatusChange(

                  e.target.value

                )

              }

              className="w-40 border rounded-xl px-4 py-3 focus:ring-2 focus:ring-green-600 outline-none"

            >

              <option>All</option>

              <option>Active</option>

              <option>Inactive</option>

            </select>

          </div>

          <div className="pt-7">

            <span className="text-sm text-slate-500">

              Showing

            </span>

            <span className="ml-2 font-semibold text-green-700">

              {totalRecords}

            </span>

            <span className="ml-1 text-sm text-slate-500">

              Record(s)

            </span>

          </div>

        </div>

        {/* Right Side */}

        <div className="flex gap-3">

          <button

            onClick={onExcel}

            className="flex items-center gap-2 bg-green-700 hover:bg-green-800 text-white px-6 py-3 rounded-xl transition"

          >

            <FileSpreadsheet size={20} />

            Export Excel

          </button>

          <button

            onClick={onPdf}

            className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-xl transition"

          >

            <FileText size={20} />

            Export PDF

          </button>

        </div>

      </div>

    </div>

  );

}

export default MasterToolbar;   