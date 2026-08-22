import {

  FileSpreadsheet,

  FileText,

  Printer,

} from "lucide-react";

function ExportCard() {

  return (

    <div className="bg-white rounded-2xl shadow border p-6">

      <h2 className="font-bold text-xl mb-5">

        Export Masters

      </h2>

      <div className="grid grid-cols-3 gap-4">

        <button className="border rounded-xl p-5 hover:bg-green-50">

          <FileSpreadsheet
            className="mx-auto text-green-700"
            size={34}
          />

          <p className="mt-3">

            Excel

          </p>

        </button>

        <button className="border rounded-xl p-5 hover:bg-red-50">

          <FileText
            className="mx-auto text-red-600"
            size={34}
          />

          <p className="mt-3">

            PDF

          </p>

        </button>

        <button className="border rounded-xl p-5 hover:bg-slate-100">

          <Printer
            className="mx-auto"
            size={34}
          />

          <p className="mt-3">

            Print

          </p>

        </button>

      </div>

    </div>

  );

}

export default ExportCard;