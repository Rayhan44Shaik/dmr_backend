import { Eye } from "lucide-react";
import { useMemo, useState } from "react";
import {
  paginationBarClass,
  paginationNavBtnClass,
  paginationPageBtnClass,
  shouldShowPagination,
} from "../../../shared/ui/paginationStyles";

type MasterDataTableProps = {
  moduleName: string;
  data: any[];
  onView?: (item: any) => void;
};

function MasterDataTable({

  moduleName,
  data,
  onView,

}: MasterDataTableProps) {

  const [page, setPage] = useState(1);

  const pageSize = 10;

  const totalPages = Math.max(
    1,
    Math.ceil(data.length / pageSize)
  );

  const paginatedData = useMemo(() => {

    const start =
      (page - 1) * pageSize;

    return data.slice(
      start,
      start + pageSize
    );

  }, [page, data]);

  const badge = (status: string) => (

    <span
      className={`px-3 py-1 rounded-full text-xs font-semibold ${
        status === "Active"
          ? "bg-green-100 text-green-700"
          : "bg-red-100 text-red-700"
      }`}
    >
      {status}
    </span>

  );

  const viewButton = (item: any) => (

    <button

      onClick={() => onView?.(item)}

      className="w-10 h-10 flex items-center justify-center rounded-lg bg-blue-100 hover:bg-blue-200 transition"

    >

      <Eye
        size={18}
        className="text-blue-700"
      />

    </button>

  );

  const renderShopTable = () => (

    <table className="w-full">

      <thead className="bg-slate-100">

        <tr>

          <th className="px-5 py-4 text-left">

            Shop No

          </th>

          <th className="px-5 py-4 text-left">

            Shop Name

          </th>

          <th className="px-5 py-4 text-left">

            Owner

          </th>

          <th className="px-5 py-4 text-left">

            Mobile

          </th>

          <th className="px-5 py-4 text-left">

            Village

          </th>

          <th className="px-5 py-4">

            Status

          </th>

          <th className="px-5 py-4">

            View

          </th>

        </tr>

      </thead>

      <tbody>

        {paginatedData.map((shop: any) => (

          <tr
            key={shop.id}
            className="border-b hover:bg-blue-50"
          >

            <td className="px-5 py-4">

              {shop.shopNo}

            </td>

            <td className="px-5 py-4 font-medium">

              {shop.shopName}

            </td>

            <td className="px-5 py-4">

              {shop.ownerName}

            </td>

            <td className="px-5 py-4">

              {shop.phoneNumber}

            </td>

            <td className="px-5 py-4">

              {shop.village}

            </td>

            <td className="px-5 py-4">

              {badge(shop.status)}

            </td>

            <td className="px-5 py-4 text-center">

              {viewButton(shop)}

            </td>

          </tr>

        ))}

      </tbody>

    </table>

  );

  const renderFarmTable = () => (

    <table className="w-full">

      <thead className="bg-slate-100">

        <tr>

          <th className="px-5 py-4">

            Farm No

          </th>

          <th className="px-5 py-4">

            Farm Name

          </th>

          <th className="px-5 py-4">

            Owner

          </th>

          <th className="px-5 py-4">

            Village

          </th>

          <th className="px-5 py-4">

            Capacity

          </th>

          <th className="px-5 py-4">

            Status

          </th>

          <th className="px-5 py-4">

            View

          </th>

        </tr>

      </thead>

      <tbody>

        {paginatedData.map((farm: any) => (

          <tr
            key={farm.id}
            className="border-b hover:bg-blue-50"
          >

            <td className="px-5 py-4">

              {farm.farmNo}

            </td>

            <td className="px-5 py-4 font-medium">

              {farm.farmName}

            </td>

            <td className="px-5 py-4">

              {farm.ownerName}

            </td>

            <td className="px-5 py-4">

              {farm.village}

            </td>

            <td className="px-5 py-4">

              {farm.capacity}

            </td>

            <td className="px-5 py-4">

              {badge(farm.status)}

            </td>

            <td className="px-5 py-4 text-center">

              {viewButton(farm)}

            </td>

          </tr>

        ))}

      </tbody>

    </table>

  );
    const renderVehicleTable = () => (

    <table className="w-full">

      <thead className="bg-slate-100">

        <tr>

          <th className="px-5 py-4 text-left">

            Vehicle No

          </th>

          <th className="px-5 py-4 text-left">

            Vehicle Number

          </th>

          <th className="px-5 py-4 text-left">

            Vehicle Type

          </th>

          <th className="px-5 py-4 text-left">

            Driver

          </th>

          <th className="px-5 py-4 text-left">

            Status

          </th>

          <th className="px-5 py-4 text-center">

            View

          </th>

        </tr>

      </thead>

      <tbody>

        {paginatedData.map((vehicle:any)=>(

          <tr
            key={vehicle.id}
            className="border-b hover:bg-blue-50"
          >

            <td className="px-5 py-4">

              {vehicle.vehicleNo}

            </td>

            <td className="px-5 py-4 font-medium">

              {vehicle.vehicleNumber}

            </td>

            <td className="px-5 py-4">

              {vehicle.vehicleType}

            </td>

            <td className="px-5 py-4">

              {vehicle.driverName}

            </td>

            <td className="px-5 py-4">

              {badge(vehicle.status)}

            </td>

            <td className="px-5 py-4 text-center">

              {viewButton(vehicle)}

            </td>

          </tr>

        ))}

      </tbody>

    </table>

  );



  const renderEmployeeTable = () => (

    <table className="w-full">

      <thead className="bg-slate-100">

        <tr>

          <th className="px-5 py-4">

            Employee

          </th>

          <th className="px-5 py-4">

            Department

          </th>

          <th className="px-5 py-4">

            Mobile

          </th>

          <th className="px-5 py-4">

            Salary

          </th>

          <th className="px-5 py-4">

            Status

          </th>

          <th className="px-5 py-4">

            View

          </th>

        </tr>

      </thead>

      <tbody>

        {paginatedData.map((emp:any)=>(

          <tr
            key={emp.id}
            className="border-b hover:bg-blue-50"
          >

            <td className="px-5 py-4 font-medium">

              {emp.employeeName}

            </td>

            <td className="px-5 py-4">

              {emp.department}

            </td>

            <td className="px-5 py-4">

              {emp.mobile}

            </td>

            <td className="px-5 py-4">

              ₹ {emp.salary}

            </td>

            <td className="px-5 py-4">

              {badge(emp.status)}

            </td>

            <td className="px-5 py-4 text-center">

              {viewButton(emp)}

            </td>

          </tr>

        ))}

      </tbody>

    </table>

  );



  const renderBankTable = () => (

    <table className="w-full">

      <thead className="bg-slate-100">

        <tr>

          <th className="px-5 py-4">

            Bank

          </th>

          <th className="px-5 py-4">

            Branch

          </th>

          <th className="px-5 py-4">

            IFSC

          </th>

          <th className="px-5 py-4">

            Status

          </th>

          <th className="px-5 py-4">

            View

          </th>

        </tr>

      </thead>

      <tbody>

        {paginatedData.map((bank:any)=>(

          <tr
            key={bank.id}
            className="border-b hover:bg-blue-50"
          >

            <td className="px-5 py-4 font-medium">

              {bank.bankName}

            </td>

            <td className="px-5 py-4">

              {bank.branchName}

            </td>

            <td className="px-5 py-4">

              {bank.ifscCode}

            </td>

            <td className="px-5 py-4">

              {badge(bank.status)}

            </td>

            <td className="px-5 py-4 text-center">

              {viewButton(bank)}

            </td>

          </tr>

        ))}

      </tbody>

    </table>

  );
    const renderBirdTypeTable = () => (

    <table className="w-full">

      <thead className="bg-slate-100">

        <tr>

          <th className="px-5 py-4 text-left">

            Bird No

          </th>

          <th className="px-5 py-4 text-left">

            Bird Type

          </th>

          <th className="px-5 py-4 text-left">

            Description

          </th>

          <th className="px-5 py-4 text-center">

            View

          </th>

        </tr>

      </thead>

      <tbody>

        {paginatedData.map((bird:any)=>(

          <tr
            key={bird.id}
            className="border-b hover:bg-blue-50"
          >

            <td className="px-5 py-4">

              {bird.birdTypeNo}

            </td>

            <td className="px-5 py-4 font-medium">

              {bird.birdType}

            </td>

            <td className="px-5 py-4">

              {bird.description}

            </td>

            <td className="px-5 py-4 text-center">

              {viewButton(bird)}

            </td>

          </tr>

        ))}

      </tbody>

    </table>

  );



  const renderRouteTable = () => (

    <div className="py-24 text-center">

      <h3 className="text-xl font-semibold text-slate-700">

        Routes Module

      </h3>

      <p className="text-slate-500 mt-2">

        Routes will be implemented soon.

      </p>

    </div>

  );



  const renderTable = () => {

    switch (moduleName) {

      case "Shops":

        return renderShopTable();

      case "Farms":

        return renderFarmTable();

      case "Vehicles":

        return renderVehicleTable();

      case "Employees":

        return renderEmployeeTable();

      case "Banks":

        return renderBankTable();

      case "Bird Types":

        return renderBirdTypeTable();

      case "Routes":

        return renderRouteTable();

      default:

        return (

          <div className="py-24 text-center text-slate-500">

            No Records Found

          </div>

        );

    }

  };



  return (

    <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">

      <div className="px-6 py-5 border-b bg-slate-50 flex justify-between items-center">

        <div>

          <h2 className="text-2xl font-bold text-slate-800">

            {moduleName}

          </h2>

          <p className="text-slate-500 mt-1">

            Showing {data.length} Record(s)

          </p>

        </div>

      </div>

      <div className="overflow-x-auto">

        {renderTable()}

      </div>

      {moduleName !== "Routes" && shouldShowPagination(data.length) && (

        <div className={paginationBarClass}>
          <button
              disabled={page===1}
              onClick={()=>setPage(page-1)}
              className={paginationNavBtnClass}
            >
              Previous
            </button>
            <span className={paginationPageBtnClass(true)}>
              {page}
            </span>
            <button
              disabled={page===totalPages}
              onClick={()=>setPage(page+1)}
              className={paginationNavBtnClass}
            >
              Next
            </button>
        </div>

      )}

    </div>

  );

}

export default MasterDataTable;