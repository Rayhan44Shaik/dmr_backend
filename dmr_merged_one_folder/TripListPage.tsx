import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import TripFilters from "../components/TripFilters";
import TripKPICards from "../components/TripKPICards";
import TripMasterTable from "../components/TripMasterTable";
import TripViewModal from "../components/TripViewModal";
import {
  paginationBarClass,
  paginationNavBtnClass,
  paginationPageBtnClass,
  shouldShowPagination,
} from "../../../../shared/ui/paginationStyles";

import { useSafeNotification } from "../../../../hooks/useSafeNotification";
import { exportToPDF, exportToExcel } from "../../../../utils/exportUtils";
import { useVehicles } from "../../../masters/vehicles/hooks/useVehicles";
import { useShops } from "../../../masters/shops/hooks/useShops";
import { useBirdTypes } from "../../../masters/bird-types/hooks/useBirdTypes";

import type { Trip } from "../types/trip";
import { listCompletedTrips, loadTripById } from "../services/tripHeaderApiService";

type TripListPageProps = { embedded?: boolean };

function TripListPage({ embedded = false }: TripListPageProps) {
  const { showNotification } = useSafeNotification();

  const [trips, setTrips] = useState<Trip[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [search, setSearch] = useState("");
  const [vehicle, setVehicle] = useState("All Vehicles");
  const [supervisor, setSupervisor] = useState("All Supervisors");
  const [farm, setFarm] = useState("All Sources");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);

  const refreshTrips = useCallback(async () => {
    try {
      setTrips(await listCompletedTrips());
    } catch {
      showNotification("Unable to load trips from the server.", "error");
    }
  }, [showNotification]);

  useEffect(() => {
    void refreshTrips();
  }, [refreshTrips]);

  const resetFilters = () => {
    setSearch("");
    setVehicle("All Vehicles");
    setSupervisor("All Supervisors");
    setFarm("All Sources");
    setFromDate("");
    setToDate("");
    setCurrentPage(1);
  };

  const filteredTrips = useMemo(() => {
    const text = search.toLowerCase();
    return trips.filter((trip) => {
      const searchMatched =
        text === "" ||
        trip.tripNo.toLowerCase().includes(text) ||
        trip.vehicleNo.toLowerCase().includes(text) ||
        trip.driverName.toLowerCase().includes(text) ||
        trip.supervisorName.toLowerCase().includes(text) ||
        trip.sourceFarm.toLowerCase().includes(text);
      const vehicleMatched = vehicle === "All Vehicles" || trip.vehicleNo === vehicle;
      const supervisorMatched =
        supervisor === "All Supervisors" || trip.supervisorName === supervisor;
      const farmMatched = farm === "All Sources" || trip.sourceFarm === farm;
      const fromMatched = !fromDate || trip.tripDate >= fromDate;
      const toMatched = !toDate || trip.tripDate <= toDate;
      return searchMatched && vehicleMatched && supervisorMatched && farmMatched && fromMatched && toMatched;
    });
  }, [trips, search, vehicle, supervisor, farm, fromDate, toDate]);

  const [viewOpen, setViewOpen] = useState(false);
  const [selectedRowId, setSelectedRowId] = useState<number | null>(null);

  const tableContainerRef = useRef<HTMLDivElement>(null);
  const viewButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        tableContainerRef.current?.contains(target) ||
        viewButtonRef.current?.contains(target)
      ) {
        return;
      }
      setSelectedRowId(null);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const { vehicles: masterVehicles } = useVehicles();
  const { shops } = useShops();
  const { birdTypes } = useBirdTypes();

  const vehicleOptions = [
    "All Vehicles",
    ...Array.from(new Set(masterVehicles.map((v) => v.vehicleNumber).filter(Boolean))),
  ];

  const safeTrips = Array.isArray(filteredTrips) ? filteredTrips : [];

  const supervisorSet = new Set(safeTrips.map((t) => t.supervisorName).filter(Boolean));
  const farmSet = new Set(safeTrips.map((t) => t.sourceFarm).filter(Boolean));

  const supervisors = ["All Supervisors", ...Array.from(supervisorSet)];
  const farms = ["All Sources", ...Array.from(farmSet)];

  const completedTrips = safeTrips;

  const hasFilters =
    search !== "" ||
    vehicle !== "All Vehicles" ||
    supervisor !== "All Supervisors" ||
    farm !== "All Sources" ||
    fromDate !== "" ||
    toDate !== "";

  const totalCompletedTrips = completedTrips.length;
  const totalCompletedShops = completedTrips.reduce((sum, t) => sum + t.totalShops, 0);
  const totalCompletedBirds = completedTrips.reduce((sum, t) => sum + t.totalBirds, 0);
  const totalCompletedWeight = completedTrips.reduce((sum, t) => sum + t.totalWeight, 0);
  const totalCompletedMortality = completedTrips.reduce((sum, t) => sum + t.totalMortality, 0);

  const pageSize = 15;
  const totalPagesCompleted = Math.ceil(completedTrips.length / pageSize);
  const paginatedTrips = completedTrips.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const startEntry = totalCompletedTrips === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endEntry = Math.min(currentPage * pageSize, totalCompletedTrips);
  void startEntry;
  void endEntry;

  const openView = (trip: Trip) => {
    setSelectedTrip(trip);
    setViewOpen(true);
    setSelectedRowId(null);
    void loadTripById(trip.id)
      .then((loaded) => setSelectedTrip(loaded))
      .catch(() => {
        showNotification("Could not refresh trip from server. Showing last loaded data.", "info");
      });
  };

  const handleRowClick = (trip: Trip) => {
    setSelectedRowId(trip.id === selectedRowId ? null : trip.id);
  };

  const handleViewSelected = () => {
    const trip = completedTrips.find((t) => t.id === selectedRowId);
    if (trip) {
      openView(trip);
    } else {
      showNotification("No trip selected or trip not found.", "info");
    }
  };

  const handleExportPDF = () => {
    const exportData = filteredTrips && filteredTrips.length > 0 ? filteredTrips : completedTrips;
    if (!exportData || exportData.length === 0) {
      showNotification("No data to export.", "error");
      return;
    }
    const headers = [
      "Trip No",
      "Date",
      "Vehicle",
      "Driver",
      "Supervisor",
      "Source Farm",
      "Shops",
      "Birds",
      "Weight (kg)",
    ];
    const rows = exportData.map((t) => [
      t.tripNo,
      t.tripDate,
      t.vehicleNo,
      t.driverName || "-",
      t.supervisorName,
      t.sourceFarm,
      t.totalShops.toString(),
      t.totalBirds.toString(),
      t.totalWeight.toFixed(2),
    ]);
    const filename = `Trips_${new Date().toISOString().split("T")[0]}`;
    exportToPDF("Trip List", headers, rows, filename);
    showNotification("PDF exported successfully!", "success");
  };

  const handleExportExcel = () => {
    const exportData = filteredTrips && filteredTrips.length > 0 ? filteredTrips : completedTrips;
    if (!exportData || exportData.length === 0) {
      showNotification("No data to export.", "error");
      return;
    }
    const headers = [
      "Trip No",
      "Date",
      "Vehicle",
      "Driver",
      "Supervisor",
      "Source Farm",
      "Shops",
      "Birds",
      "Weight (kg)",
    ];
    const rows = exportData.map((t) => [
      t.tripNo,
      t.tripDate,
      t.vehicleNo,
      t.driverName || "-",
      t.supervisorName,
      t.sourceFarm,
      t.totalShops,
      t.totalBirds,
      t.totalWeight,
    ]);
    const filename = `Trips_${new Date().toISOString().split("T")[0]}`;
    exportToExcel("Trip List", headers, rows, filename);
    showNotification("Excel exported successfully!", "success");
  };

  const handleResetFilters = () => {
    resetFilters();
    showNotification("Filters have been reset.", "info");
  };

  const content = (
    <div className={`w-full space-y-5 animate-in fade-in duration-500 ${
      embedded ? '' : 'px-3 md:px-6 py-4 bg-slate-50/50 min-h-screen text-slate-800'
    }`}>
      <TripFilters
        fromDate={fromDate}
        toDate={toDate}
        vehicle={vehicle}
        supervisor={supervisor}
        farm={farm}
        search={search}
        setFromDate={setFromDate}
        setToDate={setToDate}
        setVehicle={setVehicle}
        setSupervisor={setSupervisor}
        setFarm={setFarm}
        setSearch={setSearch}
        onSearch={() => {}}
        onReset={handleResetFilters}
        vehicles={vehicleOptions}
        supervisors={supervisors}
        farms={farms}
        onExportPDF={handleExportPDF}
        onExportExcel={handleExportExcel}
        onViewSelected={handleViewSelected}
        showViewButton={selectedRowId !== null}
        hasFilters={hasFilters}
        viewButtonRef={viewButtonRef}
      />

      {hasFilters && (
        <TripKPICards
          totalTrips={totalCompletedTrips}
          totalBirds={totalCompletedBirds}
          totalWeight={totalCompletedWeight}
          totalMortality={totalCompletedMortality}
          totalShops={totalCompletedShops}
        />
      )}

      <div ref={tableContainerRef} className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden text-xs md:text-sm">
        <TripMasterTable
          trips={paginatedTrips}
          selectedRowId={selectedRowId}
          onRowClick={handleRowClick}
          startIndex={(currentPage - 1) * pageSize}
        />
        {shouldShowPagination(totalCompletedTrips) && (
        <div className={paginationBarClass}>
          <button
            onClick={() => setCurrentPage(Math.max(currentPage - 1, 1))}
            disabled={currentPage === 1}
            className={paginationNavBtnClass}
          >
            Previous
          </button>
          {Array.from({ length: totalPagesCompleted }, (_, i) => i + 1).map((page) => (
            <button
              key={page}
              onClick={() => setCurrentPage(page)}
              className={paginationPageBtnClass(currentPage === page)}
            >
              {page}
            </button>
          ))}
          <button
            onClick={() => setCurrentPage(Math.min(currentPage + 1, totalPagesCompleted))}
            disabled={currentPage === totalPagesCompleted || totalPagesCompleted === 0}
            className={paginationNavBtnClass}
          >
            Next
          </button>
        </div>
        )}
      </div>

      <TripViewModal
        open={viewOpen}
        trip={selectedTrip}
        shops={shops}
        birdTypes={birdTypes}
        onClose={() => {
          setViewOpen(false);
          setSelectedTrip(null);
        }}
      />
    </div>
  );

  return content;
}

export default React.memo(TripListPage);