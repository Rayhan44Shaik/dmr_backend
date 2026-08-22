import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Trip } from "../../vehicle-trips/types/trip";
import { completedTripService } from "../services/completedTripService";
import { handleApiError } from "../../../../api";
import { dropLockedTripFromList, excludeKnownLockedTrips } from "./rateEntryLockList";

// Helper to compute aggregates from deliveries
function computeTripAggregates(trip: Trip) {
  const deliveries = trip.deliveries || [];
  return {
    totalShops: trip.totalShops ?? deliveries.length,
    totalBirds: trip.totalBirds ?? deliveries.reduce((sum, d) => sum + (d.birds || 0), 0),
    totalWeight: trip.totalWeight ?? deliveries.reduce((sum, d) => sum + (d.weight || 0), 0),
  };
}

export default function useCompletedTrips() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const lockInFlightRef = useRef(false);
  const locallyLockedTripIdsRef = useRef<Set<number>>(new Set());
  const pageSize = 10;
  const [filter, setFilter] = useState({
    fromDate: "",
    toDate: "",
    tripNo: "",
    vehicle: "",
    supervisor: "",
  });

  const loadTrips = useCallback(async () => {
    try {
      const data = await completedTripService.getCompletedTrips();
      setTrips(excludeKnownLockedTrips(data, locallyLockedTripIdsRef.current));
      setLoadError(null);
    } catch (error) {
      console.error("Failed to load Rate Entry trips from the backend", error);
      setLoadError(handleApiError(error));
    }
  }, []);

  useEffect(() => {
    // Load Rate Entry trips from the backend on mount. The async fetch's
    // setState runs after the awaited response (not synchronously in the
    // effect), which is the standard data-loading idiom.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadTrips();
  }, [loadTrips]);

  // Filter and enrich trips with aggregates
  const filteredTrips = useMemo(() => {
    return trips
      .filter((trip) => {
        const fromOk = !filter.fromDate || trip.tripDate >= filter.fromDate;
        const toOk = !filter.toDate || trip.tripDate <= filter.toDate;
        const tripOk = !filter.tripNo || trip.tripNo.toLowerCase().includes(filter.tripNo.toLowerCase());
        const vehicleOk = !filter.vehicle || trip.vehicleNo === filter.vehicle;
        const supervisorOk = !filter.supervisor || trip.supervisorName === filter.supervisor;
        return fromOk && toOk && tripOk && vehicleOk && supervisorOk;
      })
      .map((trip) => ({
        ...trip,
        ...computeTripAggregates(trip), // ensures totalShops, totalBirds, totalWeight exist
      }));
  }, [trips, filter]);

  const totalPages = Math.ceil(filteredTrips.length / pageSize);
  const paginatedTrips = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredTrips.slice(start, start + pageSize);
  }, [filteredTrips, currentPage]);

  const vehicleList = [...new Set(trips.map((x) => x.vehicleNo))];
  const supervisorList = [...new Set(trips.map((x) => x.supervisorName))];

  // Fetch the full Rate Entry detail (shop-wise deliveries + market
  // reference) from GET /operations/rate-entry/:tripId before opening the
  // modal — the backend is the authority for delivery rows.
  const openRateEntry = useCallback(async (trip: Trip) => {
    try {
      const full = await completedTripService.getTrip(trip.id);
      setSelectedTrip(full);
      setModalOpen(true);
    } catch (error) {
      console.error(`Failed to load trip ${trip.id} for Rate Entry`, error);
      setLoadError(handleApiError(error));
    }
  }, []);

  const openModifyRate = useCallback(async (trip: Trip) => {
    await openRateEntry(trip);
  }, [openRateEntry]);

  const closeRateEntry = useCallback(() => {
    setSelectedTrip(null);
    setModalOpen(false);
    setLoadError(null);
    setIsSaving(false);
  }, []);

  /** Save only (no lock) — PUT /operations/rate-entry/:tripId. */
  const saveTrip = useCallback(
    async (deliveries: Trip["deliveries"]): Promise<boolean> => {
      if (!selectedTrip || isSaving) return false;
      setIsSaving(true);
      try {
        await completedTripService.saveOnly(selectedTrip.id, deliveries);
        const full = await completedTripService.getTrip(selectedTrip.id);
        setSelectedTrip(full);
        await loadTrips();
        return true;
      } catch (error) {
        console.error(`Failed to save rates for trip ${selectedTrip.id}`, error);
        setLoadError(handleApiError(error));
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [selectedTrip, isSaving, loadTrips]
  );

  /** Atomic Save & Lock — POST /operations/rate-entry/:tripId/lock. */
  const saveAndLockTrip = useCallback(
    async (deliveries: Trip["deliveries"]): Promise<boolean> => {
      if (!selectedTrip || isSaving || lockInFlightRef.current) return false;
      const lockedTripId = selectedTrip.id;
      lockInFlightRef.current = true;
      setIsSaving(true);
      try {
        await completedTripService.saveRates(lockedTripId, deliveries);
        locallyLockedTripIdsRef.current.add(lockedTripId);
        setTrips((prev) => dropLockedTripFromList(prev, lockedTripId));
        closeRateEntry();
        await loadTrips();
        return true;
      } catch (error) {
        console.error(`Failed to save & lock rates for trip ${lockedTripId}`, error);
        setLoadError(handleApiError(error));
        return false;
      } finally {
        lockInFlightRef.current = false;
        setIsSaving(false);
      }
    },
    [selectedTrip, isSaving, closeRateEntry, loadTrips]
  );

  const resetFilters = useCallback(() => {
    setFilter({ fromDate: "", toDate: "", tripNo: "", vehicle: "", supervisor: "" });
    setCurrentPage(1);
  }, []);

  return {
    trips,
    filteredTrips,
    paginatedTrips,
    currentPage,
    totalPages,
    setCurrentPage,
    filter,
    setFilter,
    resetFilters,
    vehicleList,
    supervisorList,
    modalOpen,
    selectedTrip,
    openRateEntry,
    openModifyRate,
    closeRateEntry,
    saveTrip,
    saveAndLockTrip,
    loadError,
    isSaving,
  };
}
