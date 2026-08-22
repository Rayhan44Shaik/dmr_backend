// src/modules/operations/vehicle-trips/hooks/useTrips.ts

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Trip } from "../types/trip";
import { apiPut } from "../../../../api";
import { listTrips, changeTripStatus, deleteTripFromApi } from "../services/tripHeaderApiService";
import { sendTripDeliveryEmails } from "../services/deliveryEmailService";

type NotificationFn = (message: string, type?: "success" | "error" | "info") => void;

export default function useTrips(
  showNotification?: NotificationFn,
  options?: { includeDeleted?: boolean }
) {
  const notifyRef = useRef(showNotification);
  notifyRef.current = showNotification;
  const notify = useCallback(
    (message: string, type?: "success" | "error" | "info") =>
      notifyRef.current ? notifyRef.current(message, type) : alert(message),
    []
  );

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All");
  const [vehicle, setVehicle] = useState("All Vehicles");
  const [driver, setDriver] = useState("All");
  const [supervisor, setSupervisor] = useState("All Supervisors");
  const [farm, setFarm] = useState("All Sources");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const [trips, setTrips] = useState<Trip[]>([]);
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const includeDeleted = Boolean(options?.includeDeleted);

  const refreshTrips = useCallback(async () => {
    try {
      setTrips(await listTrips({ includeDeleted }));
    } catch {
      notifyRef.current?.("Unable to load trips from the server.", "error");
    }
  }, [includeDeleted]);

  useEffect(() => {
    void refreshTrips();
  }, [refreshTrips]);

  const resetFilters = () => {
    setSearch("");
    setStatus("All");
    setVehicle("All Vehicles");
    setDriver("All");
    setSupervisor("All Supervisors");
    setFarm("All Sources");
    setFromDate("");
    setToDate("");
    setCurrentPage(1);
  };

  // ✅ Soft-delete via the backend API (PostgreSQL soft-delete). The Trip List /
  // Recent lifecycle is backend-authoritative and survives refresh — never
  // localStorage. `deleted` trips stay soft-deleted and never resurface.
  const deleteTrip = async (id: number, reason?: string) => {
    try {
      await deleteTripFromApi(id, reason || "No reason provided");
      await refreshTrips();
      notify("Trip deleted successfully!", "success");
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? "Failed to delete trip.";
      notify(`Failed to delete trip: ${msg}`, "error");
    }
  };

  // ✅ Persist a full-trip edit through the backend generic save. Kept for API
  // parity; the wizard uses submitStep endpoints, but any caller that replaces
  // a trip object now writes to PostgreSQL, not localStorage.
  const updateTrip = async (trip: Trip) => {
    try {
      const { data } = await apiPut<Record<string, unknown>>(
        `/trips/${trip.id}`,
        { ...trip, mode: "submit" }
      );
      await refreshTrips();
      notify("Trip updated successfully!", "success");
      return data;
    } catch {
      notify("Failed to update trip.", "error");
    }
  };

  // ✅ Updated: accept approvedBy parameter. Status transitions (Pending ->
  // Completed) are validated and persisted by the backend API.
  const changeStatus = async (trip: Trip, status: "Pending" | "Completed", approvedBy?: string) => {
    try {
      const updated = await changeTripStatus(trip.id, status, approvedBy);
      await refreshTrips();
      notify(status === "Completed" ? "Trip approved successfully!" : "Trip status updated.", "success");
      if (status === "Completed") {
        void sendTripDeliveryEmails(updated);
      }
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? "Failed to update trip status.";
      notify(`Failed to update trip status: ${msg}`, "error");
    }
  };

  const recentTrips = useMemo(() => trips.slice(0, 5), [trips]);

  const filteredTrips = useMemo(() => {
    return (trips || []).filter((trip) => {
      const text = search.toLowerCase();
      const searchMatched =
        text === "" ||
        trip.tripNo.toLowerCase().includes(text) ||
        trip.vehicleNo.toLowerCase().includes(text) ||
        trip.driverName.toLowerCase().includes(text) ||
        trip.supervisorName.toLowerCase().includes(text) ||
        trip.sourceFarm.toLowerCase().includes(text);

      const statusMatched = status === "All" || trip.status === status;
      const vehicleMatched = vehicle === "All Vehicles" || trip.vehicleNo === vehicle;
      const driverMatched = driver === "All" || trip.driverName === driver;
      const supervisorMatched = supervisor === "All Supervisors" || trip.supervisorName === supervisor;
      const farmMatched = farm === "All Sources" || trip.sourceFarm === farm;
      const fromMatched = !fromDate || trip.tripDate >= fromDate;
      const toMatched = !toDate || trip.tripDate <= toDate;

      return (
        searchMatched &&
        statusMatched &&
        vehicleMatched &&
        driverMatched &&
        supervisorMatched &&
        farmMatched &&
        fromMatched &&
        toMatched &&
        !trip.deleted
      );
    });
  }, [
    trips,
    search,
    status,
    vehicle,
    driver,
    supervisor,
    farm,
    fromDate,
    toDate,
  ]);

  const totalPages = Math.ceil((filteredTrips?.length || 0) / pageSize);
  const paginatedTrips = (filteredTrips || []).slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const allTrips = trips || [];

  const totalTrips = filteredTrips?.length || 0;
  const totalShops = filteredTrips?.reduce((sum, t) => sum + t.totalShops, 0) || 0;
  const totalBirds = filteredTrips?.reduce((sum, t) => sum + t.totalBirds, 0) || 0;
  const totalWeight = filteredTrips?.reduce((sum, t) => sum + t.totalWeight, 0) || 0;
  const totalMortality = filteredTrips?.reduce((sum, t) => sum + t.totalMortality, 0) || 0;
  const totalExpenses = filteredTrips?.reduce((sum, t) => sum + t.expense, 0) || 0;

  return {
    trips: paginatedTrips || [],
    allTrips: allTrips,
    filteredTrips: filteredTrips || [],
    recentTrips: recentTrips || [],
    refreshTrips,
    deleteTrip,
    selectedTrip,
    setSelectedTrip,
    currentPage,
    setCurrentPage,
    totalPages,
    pageSize,
    totalTrips,
    totalShops,
    totalBirds,
    totalWeight,
    totalMortality,
    totalExpenses,
    updateTrip,
    changeStatus,
    search,
    setSearch,
    status,
    setStatus,
    vehicle,
    setVehicle,
    driver,
    setDriver,
    supervisor,
    setSupervisor,
    farm,
    setFarm,
    fromDate,
    setFromDate,
    toDate,
    setToDate,
    resetFilters,
  };
}