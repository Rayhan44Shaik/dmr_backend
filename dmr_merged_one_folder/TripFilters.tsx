import React from "react";
import Select from "react-select";
import { FileText, FileSpreadsheet, Search, Eye, Calendar, Truck, UserCog, Warehouse, RotateCcw } from "lucide-react";
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
  vehicle: string;
  supervisor: string;
  farm: string;
  search: string;
  setFromDate: (v: string) => void;
  setToDate: (v: string) => void;
  setVehicle: (v: string) => void;
  setSupervisor: (v: string) => void;
  setFarm: (v: string) => void;
  setSearch: (v: string) => void;
  onSearch: () => void;
  onReset: () => void;
  vehicles?: string[];
  supervisors?: string[];
  farms?: string[];
  onExportPDF?: () => void;
  onExportExcel?: () => void;
  onViewSelected?: () => void;
  showViewButton?: boolean;
  hasFilters?: boolean;
  viewButtonRef?: React.Ref<HTMLButtonElement>;
  totalCount?: number;
}

const containsFilter = (option: any, inputValue: string) => {
  if (!inputValue) return true;
  return option.label.toLowerCase().includes(inputValue.toLowerCase());
};

function TripFilters({
  fromDate,
  toDate,
  vehicle,
  supervisor,
  farm,
  search,
  setFromDate,
  setToDate,
  setVehicle,
  setSupervisor,
  setFarm,
  setSearch,
  onSearch,
  onReset,
  vehicles = [],
  supervisors = [],
  farms = [],
  onExportPDF,
  onExportExcel,
  onViewSelected,
  showViewButton = false,
  hasFilters = false,
  viewButtonRef,
}: Props) {
  const vehicleOptions = (vehicles || []).map((v) => ({ value: v, label: v }));
  const supervisorOptions = (supervisors || []).map((v) => ({ value: v, label: v }));
  const farmOptions = (farms || []).map((v) => ({ value: v, label: v }));

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
            options={vehicleOptions}
            value={vehicleOptions.find((x) => x.value === vehicle)}
            onChange={(e) => setVehicle(e?.value || "All Vehicles")}
            isSearchable
            filterOption={containsFilter}
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
            options={supervisorOptions}
            value={supervisorOptions.find((x) => x.value === supervisor)}
            onChange={(e) => setSupervisor(e?.value || "All Supervisors")}
            isSearchable
            filterOption={containsFilter}
            placeholder="All Supervisors"
            styles={selectStyles}
          />
        </div>

        <div>
          <label className={opsFilterLabelClass}>
            <Warehouse size={13} className="text-emerald-600 flex-shrink-0" />
            <span>Source Farm</span>
          </label>
          <Select
            options={farmOptions}
            value={farmOptions.find((x) => x.value === farm)}
            onChange={(e) => setFarm(e?.value || "All Sources")}
            isSearchable
            filterOption={containsFilter}
            placeholder="All Sources"
            styles={selectStyles}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-end pt-1">
        <div className="lg:col-span-5">
          <label className={opsFilterLabelClass}>
            <Search size={13} className="text-slate-400 flex-shrink-0" />
            <span>Search</span>
          </label>
          <div className="relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by Trip No, Vehicle, Supervisor, or Farm..."
              className={`${opsInputClass} pl-10`}
            />
          </div>
        </div>

        <div className="lg:col-span-7 flex items-center gap-2 justify-end flex-wrap">
          {showViewButton && onViewSelected && (
            <button
              ref={viewButtonRef}
              onClick={onViewSelected}
              className={opsPrimaryButtonClass}
            >
              <Eye size={15} />
              View Selected
            </button>
          )}
          <button onClick={onSearch} className={opsPrimaryButtonClass}>
            <Search size={15} />
            Search
          </button>
          <button onClick={onReset} className={opsSecondaryButtonClass}>
            <RotateCcw size={14} />
            Reset
          </button>
          {onExportPDF && (
            <button onClick={onExportPDF} disabled={!hasFilters} className={opsPdfButtonClass}>
              <FileText size={15} />
              PDF
            </button>
          )}
          {onExportExcel && (
            <button onClick={onExportExcel} disabled={!hasFilters} className={opsExcelButtonClass}>
              <FileSpreadsheet size={15} />
              Excel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default React.memo(TripFilters);