import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

type MasterCardProps = {
  title: string;
  total: number;
  active: number;
  inactive: number;
  icon: React.ReactNode;
  color: string;
  path: string;
};

function MasterCard({
  title,
  total,
  active,
  inactive,
  icon,
  color,
  path,
}: MasterCardProps) {

  return (

    <Link
      to={path}
      className="bg-white rounded-2xl shadow-sm hover:shadow-lg transition overflow-hidden border"
    >

      <div className="p-5">

        <div className="flex justify-between items-center">

          <div>

            <h3 className="text-slate-700 font-semibold text-lg">
              {title}
            </h3>

            <h1 className="text-4xl font-bold mt-2">
              {total}
            </h1>

          </div>

          <div
            className={`h-16 w-16 rounded-full flex items-center justify-center ${color}`}
          >
            {icon}
          </div>

        </div>

        <div className="flex gap-6 mt-6 text-sm">

          <span className="text-green-700">
            Active : {active}
          </span>

          <span className="text-red-600">
            Inactive : {inactive}
          </span>

        </div>

      </div>

      <div className="border-t p-3 flex justify-center items-center gap-2 text-blue-600 font-medium">

        View Details

        <ChevronRight size={18}/>

      </div>

    </Link>

  );

}

export default MasterCard;