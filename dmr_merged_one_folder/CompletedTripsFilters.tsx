import { Search, FileText, FileSpreadsheet, Calendar, Truck, UserCog, Hash, RotateCcw } from "lucide-react";
import Select from "react-select";
import { DatePicker } from "../../../../components/common/DatePicker";
import {
  opsFilterCardClass,
  opsFilterLabelClass,
  opsInputClass,
  opsPrimaryButtonClass,
  opsSecondaryButtonClass,
  opsPdfButtonClass,
  opsExcelButtonClass,
  opsReactSelectStyles,
} from "../../../../shared/ui/operationsStyles";

interface Props {
  fromDate: string;
  toDate: string;
  tripNo: string;
  vehicle: string;
  supervisor: string;
  vehicleList: string[];
  supervisorList: string[];
  setFromDate: (value: string) => void;
  setToDate: (value: string) => void;
  setTripNo: (value: string) => void;
  setVehicle: (value: string) => void;
  setSupervisor: (value: string) => void;
  onSearch: () => void;
  onReset: () => void;
  pendingTrips?: number;
  hasFilters?: boolean;
  onExportPDF?: () => void;
  onExportExcel?: () => void;
}

export default function CompletedTripsFilters({
  fromDate,
  toDate,
  tripNo,
  vehicle,
  supervisor,
  vehicleList,
  supervisorList,
  setFromDate,
  setToDate,
  setTripNo,
  setVehicle,
  setSupervisor,
  onSearch,
  onReset,
  pendingTrips = 0,
  hasFilters = false,
  onExportPDF,
  onExportExcel,
}: Props) {
  const enableExports = hasFilters && pendingTrips > 0;
  const selectStyles = opsReactSelectStyles();

  return (
    <div className={opsFilterCardClass}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        <div>
          <label className={opsFilterLabelClass}>
            <Calendar size={13} className="text-emerald-600 flex-shrink-0" />
            <span>From Date</span>
          </label>
          <DatePicker
            value={fromDate}
            onChange={setFromDate}
            placeholder="Select date"
            className="w-full text-xs font-medium"
          />
        </div>

        <div>
          <label className={opsFilterLabelClass}>
            <Calendar size={13} className="text-emerald-600 flex-shrink-0" />
            <span>To Date</span>
          </label>
          <DatePicker
            value={toDate}
            onChange={setToDate}
            placeholder="Select date"
            className="w-full text-xs font-medium"
          />
        </div>

        <div>
          <label className={opsFilterLabelClass}>
            <Truck size={13} className="text-emerald-600 flex-shrink-0" />
            <span>Vehicle</span>
          </label>
          <Select
            options={vehicleList.map((item) => ({ value: item, label: item }))}
            value={vehicle ? { value: vehicle, label: vehicle } : null}
            onChange={(selected) => setVehicle(selected ? selected.value : "")}
            isSearchable
            placeholder="All Vehicles"
            styles={selectStyles}
          />
        </div>

        <div>
          <label className={opsFilterLabelClass}>
            <UserCog size={13} className="text-emerald-600 flex-shrink-0" />
            <span>Supervisor</span>
          </label>
          <Select
            options={supervisorList.map((item) => ({ value: item, label: item }))}
            value={supervisor ? { value: supervisor, label: supervisor } : null}
            onChange={(selected) => setSupervisor(selected ? selected.value : "")}
            isSearchable
            placeholder="All Supervisors"
            styles={selectStyles}
          />
        </div>

        <div>
          <label className={opsFilterLabelClass}>
            <Hash size={13} className="text-slate-400 flex-shrink-0" />
            <span>Trip No</span>
          </label>
          <div className="relative">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={tripNo}
              onChange={(e) => setTripNo(e.target.value)}
              placeholder="Trip Number..."
              className={`${opsInputClass} pl-10`}
            />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-4 pt-1">
        <div className="text-xs font-semibold text-slate-600">
          Pending Trips : <span className="font-bold text-orange-600">{pendingTrips}</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={onSearch} className={opsPrimaryButtonClass}>
            <Search size={15} />
            Search
          </button>
          <button onClick={onReset} className={opsSecondaryButtonClass}>
            <RotateCcw size={14} />
            Reset
          </button>
          <button onClick={onExportPDF} disabled={!enableExports} className={opsPdfButtonClass}>
            <FileText size={15} />
            PDF
          </button>
          <button onClick={onExportExcel} disabled={!enableExports} className={opsExcelButtonClass}>
            <FileSpreadsheet size={15} />
            Excel
          </button>
        </div>
      </div>
    </div>
  );
}