import type { ReactNode } from "react";
import { X } from "lucide-react";



interface Props {
  open: boolean;
  title: string;
  width?: string;
  onClose: () => void;
  children: ReactNode;
}

export default function Modal({

  open,

  title,

  width = "max-w-3xl",

  onClose,

  children

}: Props) {

  if (!open) return null;

  return (

    <div className="fixed inset-0 z-50 flex items-center justify-center">

      {/* Background */}

      <div

        onClick={onClose}

        className="absolute inset-0 bg-black/40"

      />

      {/* Modal */}

      <div

        className={`relative bg-white rounded-2xl shadow-2xl w-full ${width} mx-4 overflow-hidden`}

      >

        {/* Header */}

        <div className="flex items-center justify-between border-b px-6 py-4">

          <h2 className="text-xl font-bold text-slate-800">

            {title}

          </h2>

          <button

            onClick={onClose}

            className="rounded-lg p-2 hover:bg-slate-100"

          >

            <X size={20} />

          </button>

        </div>

        {/* Body */}

        <div className="p-6">

          {children}

        </div>

      </div>

    </div>

  );

}