import { useState, useRef, useCallback, type Dispatch, type SetStateAction } from "react";
import type { Trip, ShopDelivery, BoxDetail, TripStatus } from "../../../../shared/trip/types";
import {
  handleApiError,
  loadTripById,
  saveTripDeliveries,
  saveTripStepProgress,
  submitStep1,
  submitTripStep,
} from "../services/tripHeaderApiService";
import {
  applyDeliveryMetrics,
  calculatePickupTotals,
  createEmptyTrip,
  validateStartStep,
  validateFarmStep,
  validatePickupStep,
  validateDeliveriesStep,
  validateEndStep,
} from "../../../../shared/trip";

type NotificationFn = (msg: string, type?: "success" | "error" | "info") => void;

export function useTripEntry(
  showNotification?: NotificationFn,
  onTripsChanged?: () => void
) {
  const notifyRef = useRef(showNotification);
  notifyRef.current = showNotification;
  const onTripsChangedRef = useRef(onTripsChanged);
  onTripsChangedRef.current = onTripsChanged;

  const emptyTrip = createEmptyTrip;

  const [trip, setTrip] = useState<Trip>(emptyTrip);
  const [savedTrip, setSavedTrip] = useState<Trip>(emptyTrip);
  const tripRef = useRef(trip);
  tripRef.current = trip;

  const [isEditing, setIsEditing] = useState(false);
  const [endStepSubmitted, setEndStepSubmitted] = useState<boolean>(false);
  const [headerLoading, setHeaderLoading] = useState(false);

  const onTripIdAssignedRef = useRef<((id: number) => void) | null>(null);
  const onStep1SuccessRef = useRef<((trip: Trip) => void) | null>(null);
  const onStep2SuccessRef = useRef<((trip: Trip) => void) | null>(null);
  const onStep3SuccessRef = useRef<((trip: Trip) => void) | null>(null);
  const onStep4SuccessRef = useRef<((trip: Trip) => void) | null>(null);

  const syncEndStep = (tripData: Trip) => {
    setEndStepSubmitted(tripData.endStepSubmitted || false);
  };

  /** URL synchronization is only used after loading an existing permanent trip. */
  const registerTripIdCallback = useCallback((cb: (id: number) => void) => {
    onTripIdAssignedRef.current = cb;
  }, []);

  /** Parent registers post-submit UI reset (Recent Trips already refreshed via onTripsChanged). */
  const registerStep1SuccessCallback = useCallback((cb: (trip: Trip) => void) => {
    onStep1SuccessRef.current = cb;
  }, []);

  const registerStep2SuccessCallback = useCallback((cb: (trip: Trip) => void) => {
    onStep2SuccessRef.current = cb;
  }, []);

  const registerStep3SuccessCallback = useCallback((cb: (trip: Trip) => void) => {
    onStep3SuccessRef.current = cb;
  }, []);

  const registerStep4SuccessCallback = useCallback((cb: (trip: Trip) => void) => {
    onStep4SuccessRef.current = cb;
  }, []);

  const subscribeHeaderSaveStatus = useCallback(() => () => {}, []);
  const getHeaderSaveStatus = useCallback(
    (): "idle" | "saving" | "saved" => "idle",
    []
  );

  /** Step 1 edits update React state only — no localStorage, no backend. */
  const applyStartFieldChange = useCallback(
    (updater: Trip | ((prev: Trip) => Trip)) => {
      setTrip((previous) => {
        const next =
          typeof updater === "function" ? updater(previous) : { ...previous, ...updater };
        tripRef.current = next;
        return next;
      });
    },
    []
  );

  const setStartTrip: Dispatch<SetStateAction<Trip>> = useCallback(
    (action) => {
      applyStartFieldChange(action);
    },
    [applyStartFieldChange]
  );

  const updateStartTrip = useCallback(
    (updates: Partial<Trip>) => {
      applyStartFieldChange((prev) => ({ ...prev, ...updates }));
    },
    [applyStartFieldChange]
  );

  const loadTripFromApi = useCallback(async (id: number): Promise<Trip | null> => {
    setHeaderLoading(true);
    try {
      const loaded = await loadTripById(id);
      setTrip(loaded);
      setSavedTrip(loaded);
      tripRef.current = loaded;
      syncEndStep(loaded);
      setIsEditing(true);
      onTripIdAssignedRef.current?.(loaded.id);
      return loaded;
    } catch (error) {
      notifyRef.current?.(handleApiError(error), "error");
      return null;
    } finally {
      setHeaderLoading(false);
    }
  }, []);

  const applySavedTrip = (saved: Trip) => {
    setTrip(saved);
    setSavedTrip(saved);
    tripRef.current = saved;
    syncEndStep(saved);
    setIsEditing(true);
    onTripsChangedRef.current?.();
  };

  const submitStartStep = async (data: Partial<Trip> = {}): Promise<boolean> => {
    const merged = {
      ...tripRef.current,
      ...data,
    };
    const validation = validateStartStep(merged as Trip);
    if (!validation.valid) {
      return false;
    }

    setHeaderLoading(true);
    try {
      const submitted = await submitStep1({
        ...merged,
      });

      applySavedTrip(submitted);
      onStep1SuccessRef.current?.(submitted);
      return true;
    } catch (error) {
      notifyRef.current?.(handleApiError(error), "error");
      return false;
    } finally {
      setHeaderLoading(false);
    }
  };

  /** Update an ALREADY-SUBMITTED Step 1 (top-level Edit → "Update Start
   * Details"). Uses the existing-trip submit step endpoint (mode submit) so the
   * step STAYS submitted and the backend re-validates changed resources/meters
   * (self-excluded) — never a save-mode call that would strip start_step_submitted. */
  const updateStartStep = async (data: Partial<Trip> = {}): Promise<boolean> => {
    const current = { ...tripRef.current, ...data };
    if (!current.id) {
      notifyRef.current?.("Trip ID is missing. Submit Start Details first.", "error");
      return false;
    }

    const validation = validateStartStep(current as Trip);
    if (!validation.valid) {
      return false;
    }

    setHeaderLoading(true);
    try {
      const submitted = await submitTripStep(current.id, "start", {
        ...current,
        startStepSubmitted: true,
      });
      applySavedTrip(submitted);
      return true;
    } catch (error) {
      notifyRef.current?.(handleApiError(error), "error");
      return false;
    } finally {
      setHeaderLoading(false);
    }
  };

  const submitFarmStep = async (data: Partial<Trip> = {}): Promise<boolean> => {
    const current = tripRef.current;
    if (!current.id) {
      notifyRef.current?.("Trip ID is missing. Submit Step 1 first.", "error");
      return false;
    }

    const wasSubmitted = Boolean(current.farmStepSubmitted);
    const tolls = Number(data.pickupTolls ?? current.pickupTolls ?? 0);
    const updatedData = {
      ...current,
      ...data,
      pickupTolls: Number.isFinite(tolls) && tolls < 0 ? 0 : Number.isFinite(tolls) ? tolls : 0,
    };

    const validation = validateFarmStep(updatedData as Trip);
    if (!validation.valid) {
      return false;
    }

    setHeaderLoading(true);
    try {
      const submitted = await submitTripStep(current.id, "farm", {
        ...updatedData,
        farmStepSubmitted: true,
      });
      applySavedTrip(submitted);
      if (!wasSubmitted) {
        onStep2SuccessRef.current?.(submitted);
      }
      return true;
    } catch (error) {
      notifyRef.current?.(handleApiError(error), "error");
      return false;
    } finally {
      setHeaderLoading(false);
    }
  };

  const saveStepProgress = async (
    step: "start" | "farm" | "pickup" | "deliveries" | "expenses",
    data: Partial<Trip> = {}
  ): Promise<boolean> => {
    const current = { ...tripRef.current, ...data } as Trip;
    if (!current.id) {
      notifyRef.current?.("Submit Start Details before saving later progress.", "error");
      return false;
    }

    const validation =
      step === "farm"
        ? { valid: true, errors: [] as string[] }
        : step === "start"
        ? validateStartStep(current)
        : { valid: true, errors: [] as string[] };
    if (step !== "farm" && step !== "pickup" && !validation.valid) {
      return false;
    }

    const label = {
      start: "Start",
      farm: "Farm",
      pickup: "Pickup",
      deliveries: "Delivery",
      expenses: "End",
    }[step];
    setHeaderLoading(true);
    try {
      const saved = await saveTripStepProgress(current.id, step, current);
      applySavedTrip(saved);
      return true;
    } catch (error) {
      if (step === "farm" || step === "pickup") {
        notifyRef.current?.(handleApiError(error), "error");
      } else {
        console.error(`Unable to save ${label.toLowerCase()} details:`, error);
      }
      return false;
    } finally {
      setHeaderLoading(false);
    }
  };

  const saveStartProgress = (data: Partial<Trip> = {}) =>
    saveStepProgress("start", data);
  const saveFarmProgress = (data: Partial<Trip> = {}) =>
    saveStepProgress("farm", data);
  const savePickupProgress = (data: Partial<Trip> = {}) =>
    saveStepProgress("pickup", data);
  const saveDeliveriesProgress = async (rows: ShopDelivery[]): Promise<boolean> => {
    const current = tripRef.current;
    if (!current.id) {
      notifyRef.current?.("Trip ID is missing. Submit Step 1 first.", "error");
      return false;
    }
    const withKeys = rows.map((row) => ({
      ...row,
      clientKey: row.clientKey || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `ck-${row.id}`),
    }));
    setHeaderLoading(true);
    try {
      const saved = await saveTripDeliveries(current.id, { ...current, deliveries: withKeys });
      applySavedTrip(saved);
      return true;
    } catch (error) {
      notifyRef.current?.(handleApiError(error), "error");
      return false;
    } finally {
      setHeaderLoading(false);
    }
  };
  const saveEndProgress = (data: Partial<Trip> = {}) =>
    saveStepProgress("expenses", data);

  /** Pickup edits stay in React state until Submit — no localStorage, no backend. */
  const updateBoxDetails = (
    rows: BoxDetail[],
    _persistToStorage: boolean = false,
    _silent: boolean = false
  ) => {
    const current = tripRef.current;
    const totals = calculatePickupTotals(rows);
    const updatedTrip: Trip = {
      ...current,
      boxDetails: rows,
      ...totals,
    };

    setTrip(updatedTrip);
    tripRef.current = updatedTrip;
    syncEndStep(updatedTrip);
  };

  const submitPickupStep = async (data: Partial<Trip> = {}): Promise<boolean> => {
    const current = tripRef.current;
    if (!current.id) {
      notifyRef.current?.("Trip ID is missing. Submit Step 1 first.", "error");
      return false;
    }

    const wasSubmitted = Boolean(current.pickupStepSubmitted);
    const updatedData = { ...current, ...data };
    const validation = validatePickupStep(updatedData as Trip);
    if (!validation.valid) {
      notifyRef.current?.(validation.errors[0], "error");
      return false;
    }

    setHeaderLoading(true);
    try {
      const submitted = await submitTripStep(current.id, "pickup", updatedData);
      applySavedTrip(submitted);
      if (!wasSubmitted) {
        onStep3SuccessRef.current?.(submitted);
      }
      return true;
    } catch (error) {
      notifyRef.current?.(handleApiError(error), "error");
      return false;
    } finally {
      setHeaderLoading(false);
    }
  };

  const submitDeliveriesStep = async (): Promise<boolean> => {
    const current = tripRef.current;
    if (!current.id) {
      notifyRef.current?.("Trip ID is missing. Submit Step 1 first.", "error");
      return false;
    }
    const wasSubmitted = Boolean(current.deliveryStepSubmitted);
    if (!current.deliveries || current.deliveries.length === 0) {
      return false;
    }

    const validation = validateDeliveriesStep(current, current.deliveries);
    if (!validation.valid) {
      return false;
    }
    for (const row of current.deliveries) {
      if (!row.shopId || !row.birdTypeId) {
        return false;
      }
    }

    setHeaderLoading(true);
    try {
      const submitted = await submitTripStep(current.id, "deliveries", current);
      applySavedTrip(submitted);
      if (!wasSubmitted) {
        onStep4SuccessRef.current?.(submitted);
      }
      return true;
    } catch (error) {
      const message = handleApiError(error);
      const apiErr = error as { status?: number; code?: string };
      if (apiErr?.code === "NETWORK_ERROR" || message.toLowerCase().includes("unable to reach")) {
        notifyRef.current?.("Unable to connect. Please try again.", "error");
      } else {
        notifyRef.current?.(message, "error");
      }
      return false;
    } finally {
      setHeaderLoading(false);
    }
  };

  const updateTrip = (updates: Partial<Trip>) => {
    setTrip((prev) => {
      const next = { ...prev, ...updates };
      tripRef.current = next;
      return next;
    });
    if (updates.endStepSubmitted !== undefined) {
      setEndStepSubmitted(updates.endStepSubmitted);
    }
  };

  const updateDeliveries = (rows: ShopDelivery[], _persistToStorage: boolean = false) => {
    const updatedTrip = applyDeliveryMetrics(tripRef.current, rows);

    // Wizard edits stay in React state until Submit.
    setTrip(updatedTrip);
    tripRef.current = updatedTrip;
    syncEndStep(updatedTrip);
  };

  const submitEndTrip = async (data: Partial<Trip> = {}): Promise<boolean> => {
    const current = { ...tripRef.current, ...data };
    if (!current.id) {
      notifyRef.current?.("Trip ID is missing. Submit Step 1 first.", "error");
      return false;
    }
    if (!current.deliveryStepSubmitted) {
      notifyRef.current?.(
        `❌ You must complete and lock the Deliveries step first.`,
        "error"
      );
      return false;
    }

    const endValidation = validateEndStep(current);
    if (!endValidation.valid) {
      return false;
    }

    const closingMeter = Number(
      current.closingMeter || (current as Trip & { endMeter?: number }).endMeter || 0
    );
    const totalKm = closingMeter - (current.openingMeter || 0);

    setHeaderLoading(true);
    try {
      const submitted = await submitTripStep(current.id, "expenses", {
        ...current,
        closingMeter,
        totalKm,
        endTime: current.endTime || new Date().toLocaleString(),
        status: "Pending" as TripStatus,
        endStepSubmitted: true,
        expensesStepSubmitted: true,
      });
      applySavedTrip(submitted);
      setEndStepSubmitted(true);
      return true;
    } catch (error) {
      console.error("Unable to submit end details:", error);
      throw new Error(handleApiError(error));
    } finally {
      setHeaderLoading(false);
    }
  };

  const loadTrip = (tripToLoad: Trip) => {
    const normalized = {
      ...tripToLoad,
      helpers: tripToLoad.helpers || [],
      deliveries: tripToLoad.deliveries || [],
      boxDetails: tripToLoad.boxDetails || [],
    };
    setTrip(normalized);
    setSavedTrip(normalized);
    tripRef.current = normalized;
    setIsEditing(true);
    setEndStepSubmitted(tripToLoad.endStepSubmitted === true);
  };

  const clearTrip = () => {
    const fresh = emptyTrip();
    setTrip(fresh);
    setSavedTrip(fresh);
    tripRef.current = fresh;
    setIsEditing(false);
    setEndStepSubmitted(false);
  };

  return {
    trip,
    savedTrip,
    setTrip,
    isEditing,
    setIsEditing,
    endStepSubmitted,
    headerLoading,
    subscribeHeaderSaveStatus,
    getHeaderSaveStatus,
    updateTrip,
    updateDeliveries,
    updateBoxDetails,
    submitStartStep,
    updateStartStep,
    saveStartProgress,
    submitFarmStep,
    saveFarmProgress,
    submitPickupStep,
    savePickupProgress,
    submitDeliveriesStep,
    saveDeliveriesProgress,
    submitEndTrip,
    saveEndProgress,
    loadTrip,
    loadTripFromApi,
    clearTrip,
    setStartTrip,
    updateStartTrip,
    registerTripIdCallback,
    registerStep1SuccessCallback,
    registerStep2SuccessCallback,
    registerStep3SuccessCallback,
    registerStep4SuccessCallback,
  };
}
