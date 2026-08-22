import { useState, useRef, useEffect } from "react";
import {
  ChevronDown,
  Download,
  FileSpreadsheet,
  FileText
} from "lucide-react";

interface Props {

  onPdf?: () => void;

  onExcel?: () => void;

}

export default function ExportDropdown({

  onPdf,

  onExcel

}: Props) {

  const [open, setOpen] = useState(false);

  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {

    function handleClickOutside(event: MouseEvent) {

      if (

        ref.current &&

        !ref.current.contains(event.target as Node)

      ) {

        setOpen(false);

      }

    }

    document.addEventListener(

      "mousedown",

      handleClickOutside

    );

    return () =>

      document.removeEventListener(

        "mousedown",

        handleClickOutside

      );

  }, []);

  return (

    <div
      ref={ref}
      className="relative"
    >

      <button

        onClick={() =>

          setOpen(!open)

        }

        className="h-11 px-5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 flex items-center gap-2 font-medium"

      >

        <Download size={18} />

        Export

        <ChevronDown size={16} />

      </button>

      {

        open && (

          <div className="absolute right-0 mt-2 w-52 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden z-50">

            <button

              onClick={() => {

                setOpen(false);

                onPdf?.();

              }}

              className="w-full px-4 py-3 flex items-center gap-3 hover:bg-red-50 text-left"

            >

              <FileText

                size={18}

                className="text-red-600"

              />

              Export PDF

            </button>

            <button

              onClick={() => {

                setOpen(false);

                onExcel?.();

              }}

              className="w-full px-4 py-3 flex items-center gap-3 hover:bg-green-50 text-left"

            >

              <FileSpreadsheet

                size={18}

                className="text-green-600"

              />

              Export Excel

            </button>

          </div>

        )

      }

    </div>

  );

}