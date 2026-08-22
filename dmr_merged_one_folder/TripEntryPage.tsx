// src/modules/operations/vehicle-trips/pages/TripEntryPage.tsx

import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { FileText, Plus } from "lucide-react";

// --- Components ---
import TripRecentTable from "../components/TripRecentTable";
import TripViewModal from "../components/TripViewModal";
import TripWizardStepper from "../components/TripWizardStepper";
import { WizardStepNotice } from "../components/WizardStepUI";
import StepStart from "../components/StepStart";
import StepDeliveries from "../components/StepDeliveries";
import StepFarm from "../components/StepFarm";
import StepPickup from "../components/StepPickup";
import StepEnd from "../components/Step_5/StepEnd";
import TripFinalKPI from "../components/TripFinalKPI";

// --- Hooks ---
import { useTripEntry } from "../hooks/useTripEntry";
import useTrips from "../hooks/useTrips";
import { fetchAvailableResources, loadTripById } from "../services/tripHeaderApiService";
import { useFarms } from "../../../masters/farms/hooks/useFarms";
import { useShops } from "../../../masters/shops/hooks/useShops";
import { useBirdTypes } from "../../../masters/bird-types/hooks/useBirdTypes";
import { useSafeNotification } from "../../../../hooks/useSafeNotification";

// --- Utils ---
import { canEditItem } from "../../../../utils/dateUtils";
import {
  getLastSubmittedTripStep,
  getNextIncompleteTripStep,
  getResumeActionLabel,
  getTripWizardCompletedMask,
  isTripEnded as hasTripEnded,
  isTripWizardComplete,
  TRIP_STEP_LABELS,
  type Trip,
  type ShopDelivery,
} from "../../../../shared/trip";

type TripEntryPageProps = { embedded?: boolean; };

const getYesterday = () => {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return date.toISOString().split("T")[0];
};

type EntryScreen = "prompt" | "form";

function TripEntryPage({ embedded = false }: TripEntryPageProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { farms } = useFarms();
  const { shops } = useShops();
  const { birdTypes } = useBirdTypes();

  const { showNotification } = useSafeNotification();
  const { allTrips, refreshTrips, deleteTrip, changeStatus } = useTrips(showNotification, {
    includeDeleted: true,
  });

  const {
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
    submitFarmStep,
    saveFarmProgress,
    submitPickupStep,
    savePickupProgress,
    submitDeliveriesStep,
    saveDeliveriesProgress,
    submitEndTrip,
    saveEndProgress,
    loadTripFromApi,
    clearTrip,
    updateStartTrip,
    registerStep1SuccessCallback,
    registerStep2SuccessCallback,
    registerStep3SuccessCallback,
    registerStep4SuccessCallback,
  } = useTripEntry(showNotification, refreshTrips);

  const [rows, setRows] = useState<ShopDelivery[]>([]);
  const [viewTrip, setViewTrip] = useState<Trip | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const [viewStepIndex, setViewStepIndex] = useState(0);

  const [entryScreen, setEntryScreen] = useState<EntryScreen>("prompt");
  const [editingSubmittedStep, setEditingSubmittedStep] = useState<number | null>(null);

  /** Strip tripId from URL so refresh never resumes an active wizard. */
  const clearTripIdFromUrl = useCallback(() => {
    const params = new URLSearchParams(location.search);
    if (!params.has("tripId")) return;
    params.set("tab", "trip-entry");
    params.delete("tripId");
    navigate(`/operations?${params.toString()}`, { replace: true });
  }, [location.search, navigate]);

  useEffect(() => {
    clearTripIdFromUrl();
  }, [clearTripIdFromUrl]);

  // After Step 1 success: close the wizard and return to Create Trip Entry.
  // The submitted trip is already in Recent Trips via onTripsChanged.
  useEffect(() => {
    registerStep1SuccessCallback(() => {
      showNotification(`Step 1 submitted successfully.`, "success");
      clearTrip();
      setRows([]);
      setEntryScreen("prompt");
      setViewStepIndex(0);
      setIsEditing(false);
      setEditingSubmittedStep(null);
      setTrip((prev) => ({ ...prev, tripDate: getYesterday() }));
      clearTripIdFromUrl();
    });
  }, [registerStep1SuccessCallback, clearTrip, clearTripIdFromUrl, setIsEditing, setTrip, showNotification]);

  useEffect(() => {
    registerStep2SuccessCallback(() => {
      showNotification("Step 2 submitted successfully.", "success");
      clearTrip();
      setRows([]);
      setEntryScreen("prompt");
      setViewStepIndex(0);
      setIsEditing(false);
      setEditingSubmittedStep(null);
      setTrip((prev) => ({ ...prev, tripDate: getYesterday() }));
      clearTripIdFromUrl();
    });
  }, [registerStep2SuccessCallback, clearTrip, clearTripIdFromUrl, setIsEditing, setTrip, showNotification]);

  useEffect(() => {
    registerStep3SuccessCallback(() => {
      showNotification("Step 3 submitted successfully.", "success");
      clearTrip();
      setRows([]);
      setEntryScreen("prompt");
      setViewStepIndex(0);
      setIsEditing(false);
      setEditingSubmittedStep(null);
      setTrip((prev) => ({ ...prev, tripDate: getYesterday() }));
      clearTripIdFromUrl();
    });
  }, [registerStep3SuccessCallback, clearTrip, clearTripIdFromUrl, setIsEditing, setTrip, showNotification]);

  useEffect(() => {
    registerStep4SuccessCallback(() => {
      /* Stay on the submitted trip so the locked Step 4 view is visible. */
    });
  }, [registerStep4SuccessCallback]);

  const handleStatusChange = (trip: Trip, status: "Pending" | "Completed") => {
    changeStatus(trip, status);
  };

  const handleView = (selectedTrip: Trip) => {
    setViewTrip(selectedTrip);
    setViewOpen(true);
    void loadTripById(selectedTrip.id)
      .then((loaded) => setViewTrip(loaded))
      .catch(() => {
        showNotification("Could not refresh trip from server. Showing last loaded data.", "info");
      });
  };

  const openExistingTrip = async (
    selectedTrip: Trip,
    targetStep: number,
    message: string,
    editSubmittedStep: number | null
  ) => {
    setEntryScreen("form");
    setIsEditing(true);
    setEditingSubmittedStep(editSubmittedStep);
    showNotification(message, "success");

    // The backend is the source of truth for step completion. Load the full
    // trip from the API and derive the step to open from THAT state, never
    // from a possibly stale Recent Trips row or the URL.
    const loaded = await loadTripFromApi(selectedTrip.id);
    const authoritative = loaded ?? selectedTrip;
    setRows(authoritative.deliveries || []);

    let resolvedStep = targetStep;
    if (editSubmittedStep == null) {
      // Resume: reopen at the first incomplete step per authoritative state.
      resolvedStep = getNextIncompleteTripStep(authoritative);
    }
    const maxAllowed = isTripWizardComplete(authoritative) ? 4 : getNextIncompleteTripStep(authoritative);
    setViewStepIndex(Math.min(Math.max(0, resolvedStep), maxAllowed));
  };

  const handleResume = (selectedTrip: Trip) => {
    if (selectedTrip.deleted || selectedTrip.status !== "Draft" || isTripWizardComplete(selectedTrip)) {
      return;
    }
    const targetStep = getNextIncompleteTripStep(selectedTrip);
    const resumeLabel = getResumeActionLabel(selectedTrip) ?? `Step ${targetStep + 1}`;
    void openExistingTrip(
      selectedTrip,
      targetStep,
      `Resuming Trip ${selectedTrip.tripNo} — ${resumeLabel}`,
      null
    );
  };

  const handleEdit = (selectedTrip: Trip) => {
    const targetStep = getLastSubmittedTripStep(selectedTrip);
    if (targetStep == null) return;
    const stepName = TRIP_STEP_LABELS[targetStep] ?? `Step ${targetStep + 1}`;
    void openExistingTrip(
      selectedTrip,
      targetStep,
      `Edit Mode — Step ${targetStep + 1}: ${stepName}`,
      targetStep
    );
  };

  const handleRefresh = async () => {
    await refreshTrips();
    showNotification("Table refreshed", "success");
  };

  const isInitialMount = useRef(true);

  useEffect(() => {
    if (isInitialMount.current) {
      if (!trip.tripDate) {
        const yesterday = getYesterday();
        setTrip((prev) => ({ ...prev, tripDate: yesterday }));
      }
      isInitialMount.current = false;
    }
  }, []);

  useEffect(() => {
    if (!isEditing && !trip.startStepSubmitted) return;
    if (!trip.deliveries) return;
    setRows(trip.deliveries);
  }, [trip.deliveries, isEditing, trip.startStepSubmitted]);

  useEffect(() => {
    refreshTrips();
  }, [
    trip.id,
    trip.tripNo,
    trip.status,
    trip.startStepSubmitted,
    trip.farmStepSubmitted,
    trip.pickupStepSubmitted,
    trip.deliveryStepSubmitted,
    trip.endStepSubmitted,
    refreshTrips,
  ]);

  const clearForm = useCallback(() => {
    clearTrip();
    setRows([]);
    setEntryScreen("prompt");
    setViewStepIndex(0);
    setIsEditing(false);
    setEditingSubmittedStep(null);
    setTrip((prev) => ({ ...prev, tripDate: getYesterday() }));
    clearTripIdFromUrl();
  }, [clearTrip, clearTripIdFromUrl, setIsEditing, setTrip]);

  const createNewTrip = useCallback(() => {
    clearTrip();
    setRows([]);
    setViewStepIndex(0);
    setTrip((prev) => ({ ...prev, tripDate: getYesterday() }));
    clearTripIdFromUrl();
    setIsEditing(true);
    setEditingSubmittedStep(null);
    setEntryScreen("form");
  }, [clearTrip, clearTripIdFromUrl, setIsEditing, setTrip]);

  const isStartCompleted = Boolean(trip.startStepSubmitted);
  const isFarmCompleted = Boolean(trip.farmStepSubmitted);
  const isPickupCompleted = Boolean(trip.pickupStepSubmitted);
  const isDeliveryCompleted = Boolean(trip.deliveryStepSubmitted);
  const isTripEnded = hasTripEnded(trip) || endStepSubmitted;

  const canEditTrip = trip.createdAt ? canEditItem(trip.createdAt) : true;

  // Shared Desktop + Mobile workflow definition.
  const currentStep = getNextIncompleteTripStep(trip);
  // The maximum step a user may view/edit right now. Completed steps (0..max-1)
  // stay reopenable; the currentStep is the working step; everything after it is
  // LOCKED until the previous step is submitted (backend-submitted state only).
  const maxAllowedStep = isTripEnded ? 4 : currentStep;
  const lockedSteps = TRIP_STEP_LABELS.map((_, index) => index > maxAllowedStep);
  // Render-safe view index — the UI must never trust a requested index that
  // bypasses the sequence (direct state/URL manipulation included).
  const effectiveViewStepIndex = Math.min(Math.max(0, viewStepIndex), maxAllowedStep);

  const [vehicleOpts, setVehicleOpts] = useState<Array<{ id: number; vehicleNumber: string }>>([]);
  const [employeeOpts, setEmployeeOpts] = useState<Array<{ id: number; employeeName: string; department: string }>>([]);

  useEffect(() => {
    let cancelled = false;
    const tripId = trip.id > 0 ? trip.id : undefined;
    void fetchAvailableResources(tripId)
      .then((available) => {
        if (cancelled) return;
        setVehicleOpts(available.vehicles ?? []);
        setEmployeeOpts([
          ...(available.drivers ?? []),
          ...(available.supervisors ?? []),
          ...(available.helpers ?? []),
          ...(available.loaders ?? []),
        ]);
      })
      .catch(() => {
        if (!cancelled) {
          setVehicleOpts([]);
          setEmployeeOpts([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [trip.id, trip.startStepSubmitted, entryScreen]);

  const step1LoadSnapshot = useMemo(
    () => trip,
    [
      trip.id,
      trip.startTime,
      trip.startStepSubmitted,
      trip.vehicleId,
      trip.vehicleNo,
      trip.driverId,
      trip.driverName,
      trip.supervisorId,
      trip.supervisorName,
      trip.helpers,
      trip.loaders,
      trip.openingMeter,
      trip.advanceAmount,
    ]
  );

  // Clamp any requested step to the highest step that is legitimately
  // available. This runs regardless of how the step was requested (click,
  // programmatic navigation, state restoration) and never relies on the
  // frontend-only flag being "next".
  useEffect(() => {
    if (viewStepIndex > maxAllowedStep) {
      setViewStepIndex(maxAllowedStep);
    }
  }, [viewStepIndex, maxAllowedStep]);

  const isNewTrip = trip.id === 0 || !trip.tripNo;

  const isEditable = (stepCompleted: boolean) => {
    if (trip.status === "Completed") return false;
    if (editingSubmittedStep === effectiveViewStepIndex && isEditing) {
      return canEditTrip || trip.status === "Draft" || trip.status === "Pending";
    }
    if (effectiveViewStepIndex === 4) {
      return isEditing && (canEditTrip || trip.status === "Draft" || trip.status === "Pending");
    }
    const isViewingActiveStep = !isTripEnded && effectiveViewStepIndex === currentStep;
    if (isViewingActiveStep && !stepCompleted) {
      return isNewTrip || isEditing || trip.status === "Draft";
    }
    return false;
  };

  const renderSelectedStep = () => {
    if (effectiveViewStepIndex === 0) {
      return (
        <StepStart
          tripId={trip.id}
          tripNo={trip.tripNo}
          startTime={trip.startTime}
          startStepSubmitted={trip.startStepSubmitted}
          loadSnapshot={step1LoadSnapshot}
          updateTrip={updateStartTrip}
          submitStartStep={submitStartStep}
          updateStartStep={updateStartStep}
          hasUnsavedChanges={JSON.stringify({
            vehicleId: trip.vehicleId, vehicleNo: trip.vehicleNo, driverId: trip.driverId,
            driverName: trip.driverName, supervisorId: trip.supervisorId,
            supervisorName: trip.supervisorName, helpers: trip.helpers, loaders: trip.loaders,
            openingMeter: trip.openingMeter, advanceAmount: trip.advanceAmount,
          }) !== JSON.stringify({
            vehicleId: savedTrip.vehicleId, vehicleNo: savedTrip.vehicleNo, driverId: savedTrip.driverId,
            driverName: savedTrip.driverName, supervisorId: savedTrip.supervisorId,
            supervisorName: savedTrip.supervisorName, helpers: savedTrip.helpers, loaders: savedTrip.loaders,
            openingMeter: savedTrip.openingMeter, advanceAmount: savedTrip.advanceAmount,
          })}
          vehicleOptions={vehicleOpts}
          employeeOptions={employeeOpts}
          editable={isEditable(isStartCompleted)}
          canEdit={canEditTrip}
          onCancel={clearForm}
          clearForm={clearForm}
          headerLoading={headerLoading}
          subscribeHeaderSaveStatus={subscribeHeaderSaveStatus}
          getHeaderSaveStatus={getHeaderSaveStatus}
        />
      );
    }

    if (effectiveViewStepIndex === 1) {
      return (
        <StepFarm
          trip={trip}
          setTrip={setTrip}
          updateTrip={updateTrip}
          submitFarmStep={submitFarmStep}
          saveFarmProgress={saveFarmProgress}
          hasUnsavedChanges={JSON.stringify({
            sourceFarmId: trip.sourceFarmId, sourceFarm: trip.sourceFarm, farmAddress: trip.farmAddress,
            destMeter: trip.destMeter, pickupTolls: trip.pickupTolls, avgBirdWeight: trip.avgBirdWeight,
            remarks: trip.remarks, farmGpsLat: trip.farmGpsLat, farmGpsLon: trip.farmGpsLon,
            farmGpsAccuracy: trip.farmGpsAccuracy, farmGpsTime: trip.farmGpsTime,
          }) !== JSON.stringify({
            sourceFarmId: savedTrip.sourceFarmId, sourceFarm: savedTrip.sourceFarm, farmAddress: savedTrip.farmAddress,
            destMeter: savedTrip.destMeter, pickupTolls: savedTrip.pickupTolls, avgBirdWeight: savedTrip.avgBirdWeight,
            remarks: savedTrip.remarks, farmGpsLat: savedTrip.farmGpsLat, farmGpsLon: savedTrip.farmGpsLon,
            farmGpsAccuracy: savedTrip.farmGpsAccuracy, farmGpsTime: savedTrip.farmGpsTime,
          })}
          farms={farms}
          editable={isEditable(isFarmCompleted)}
          canEdit={canEditTrip}
          onCancel={clearForm}
        />
      );
    }

    if (effectiveViewStepIndex === 2) {
      return (
        <StepPickup
          trip={trip}
          setTrip={setTrip}
          updateTrip={updateTrip}
          submitPickupStep={submitPickupStep}
          savePickupProgress={savePickupProgress}
          updateBoxDetails={updateBoxDetails}
          editable={isEditable(isPickupCompleted)}
          canEdit={canEditTrip}
          onCancel={clearForm}
          clearForm={clearForm}
        />
      );
    }

    if (effectiveViewStepIndex === 3) {
      return (
        <StepDeliveries
          rows={rows}
          setRows={setRows}
          shops={shops}
          birdTypes={birdTypes}
          trip={trip}
          updateDeliveries={updateDeliveries}
          submitDeliveriesStep={submitDeliveriesStep}
          saveDeliveriesProgress={saveDeliveriesProgress}
          boxDetails={trip.boxDetails || []}
          readOnly={!isEditable(isDeliveryCompleted)}
          editable={isEditable(isDeliveryCompleted)}
          canEdit={canEditTrip}
          onCancel={clearForm}
          clearForm={clearForm}
          persistedDeliveries={savedTrip.deliveries || []}
        />
      );
    }

    if (effectiveViewStepIndex === 4) {
      return (
        <StepEnd
          trip={trip}
          setTrip={setTrip}
          updateTrip={updateTrip}
          editable={isEditable(isTripEnded)}
          canEdit={canEditTrip}
          onCancel={clearForm}
          clearForm={clearForm}
          submitExpensesStep={submitEndTrip}
          saveEndProgress={saveEndProgress}
        />
      );
    }

    return (
      <div className="mt-8 text-center p-12 border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 text-sm">
        👈 Select a completed step or the current step to view it here.
      </div>
    );
  };

  const content = (
    <div className="space-y-6">
      <div className="bg-white rounded-3xl p-6 md:p-8 border border-slate-200/80 shadow-xl shadow-slate-100/70 space-y-6">
        {entryScreen === "prompt" ? (
          <div className="flex flex-col items-center justify-center text-center py-16 space-y-6">
            <div className="h-20 w-20 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 shadow-inner">
              <FileText size={36} />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-slate-800 tracking-tight">Trip Entry</h2>
              <p className="text-slate-500 max-w-md mx-auto">
                No active trip
              </p>
            </div>
            <button
              onClick={createNewTrip}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 px-8 py-3 text-sm font-bold text-white shadow-md shadow-blue-200 transition-all active:scale-95"
            >
              <Plus size={18} />
              Create New Trip
            </button>
          </div>
        ) : (
          <>
            <TripWizardStepper
              steps={TRIP_STEP_LABELS}
              currentStep={isTripEnded ? 4 : effectiveViewStepIndex}
              completedMask={getTripWizardCompletedMask(trip)}
              lockedSteps={lockedSteps}
              onStepClick={(idx) => {
                setViewStepIndex(idx);
              }}
              onLockedStepClick={(idx) => {
                // A future step is locked until the previous step is actually
                // submitted (backend state). Redirect to the correct next step.
                setViewStepIndex(currentStep);
                showNotification(
                  `Step ${idx + 1} is locked. Complete Step ${currentStep + 1} (${TRIP_STEP_LABELS[currentStep]}) first.`,
                  "info"
                );
              }}
            />

            {editingSubmittedStep != null && editingSubmittedStep === effectiveViewStepIndex && (
              <WizardStepNotice
                notice={{
                  type: "info",
                  message: `Edit Mode — Step ${editingSubmittedStep + 1}: ${TRIP_STEP_LABELS[editingSubmittedStep]}. You are editing the last submitted step.`,
                }}
              />
            )}

            <div className="mt-6">{renderSelectedStep()}</div>
            {<TripFinalKPI trip={savedTrip} deliveries={savedTrip.deliveries || []} />}
          </>
        )}
      </div>

      <TripRecentTable
        trips={allTrips}
        onRefresh={handleRefresh}
        onView={handleView}
        onEdit={handleEdit}
        onResume={handleResume}
        onDelete={(trip, reason) => deleteTrip(trip.id, reason)}
        onStatusChange={handleStatusChange}
      />

      <TripViewModal
        key={viewTrip?.id ?? "closed"}
        trip={viewTrip}
        open={viewOpen}
        onClose={() => {
          setViewOpen(false);
          setViewTrip(null);
        }}
        shops={shops}
        birdTypes={birdTypes}
      />
    </div>
  );

  if (embedded) return content;
  return <div className="px-4 md:px-8 py-8 max-w-7xl mx-auto bg-slate-50/50 min-h-screen">{content}</div>;
}

export default React.memo(TripEntryPage);
