import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  FilePlus2,
  LoaderCircle,
  LogOut,
  UserRound,
} from "lucide-react";
import BrandMark from "../../../ui/BrandMark";
import { useSafeNotification } from "../../../hooks/useSafeNotification";
import StepStart from "../../operations/vehicle-trips/components/StepStart";
import StepFarm from "../../operations/vehicle-trips/components/StepFarm";
import StepPickup from "../../operations/vehicle-trips/components/StepPickup";
import StepDeliveries from "../../operations/vehicle-trips/components/StepDeliveries";
import StepEnd from "../../operations/vehicle-trips/components/Step_5/StepEnd";
import TripWizardStepper from "../../operations/vehicle-trips/components/TripWizardStepper";
import TripFinalKPI from "../../operations/vehicle-trips/components/TripFinalKPI";
import { useTripEntry } from "../../operations/vehicle-trips/hooks/useTripEntry";
import {
  applyDeliveryMetrics,
  getNextIncompleteTripStep,
  isTripEnded as hasTripEnded,
  TRIP_STEP_LABELS,
  validateFarmStep,
  validatePickupStep,
  validateStartStep,
  type ShopDelivery,
  type Trip,
} from "../../../shared/trip";
import MobileAuthProvider from "../auth/MobileAuthProvider";
import MobileLogin from "../auth/MobileLogin";
import { useMobileAuth } from "../auth/mobileAuthContext";
import type { MobileSupervisorProfile } from "../auth/mobileAuthStorage";
import MobileSyncIndicator, {
  type MobileSyncState,
} from "../components/MobileSyncIndicator";
import RecentDraftsList from "../components/RecentDraftsList";
import {
  asMobileApiError,
  listMobileDrafts,
  loadMobileBootstrap,
  loadMobileTrip,
  mobileHealth,
  type MobileBootstrap,
  type MobileTrip,
} from "../services/mobileApiClient";
import {
  cacheDrafts,
  clearWorkingDraft,
  hasTripWork,
  isActualDraft,
  loadCachedDrafts,
  loadWorkingDraft,
  mergeDraftSnapshots,
  newMobileOperationId,
  removeCachedDraft,
  saveWorkingDraft,
  type MobileWorkingDraft,
} from "../services/mobileTripStorage";
import { cacheBootstrap, loadCachedBootstrap } from "../storage/mobileReferenceStorage";
import { useDurableMobileSync } from "../sync/useDurableMobileSync";
import "../styles/mobileTrip.css";

type Screen = "drafts" | "wizard";

function yesterday(): string {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return date.toISOString().slice(0, 10);
}

function tripVersion(trip: Trip): number | null {
  const value = Number((trip as Trip & { version?: number }).version);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function isCommitAccepted(result: "synced" | "queued" | "conflict" | "rejected") {
  return result !== "conflict" && result !== "rejected";
}

function LoadingMobileSession() {
  return (
    <main className="mobile-trip-app flex min-h-dvh items-center justify-center bg-slate-100">
      <div className="text-center text-emerald-800">
        <LoaderCircle className="mx-auto animate-spin" size={26} />
        <p className="mt-3 text-xs font-bold">Restoring secure mobile session…</p>
      </div>
    </main>
  );
}

export default function SupervisorMobilePage() {
  return (
    <MobileAuthProvider>
      <AuthenticatedMobileApp />
    </MobileAuthProvider>
  );
}

function AuthenticatedMobileApp() {
  const { loading, supervisor } = useMobileAuth();
  if (loading) return <LoadingMobileSession />;
  if (!supervisor) return <MobileLogin />;
  return <SupervisorTripWorkspace supervisor={supervisor} />;
}

function SupervisorTripWorkspace({ supervisor }: { supervisor: MobileSupervisorProfile }) {
  const { logout } = useMobileAuth();
  const { showNotification } = useSafeNotification();
  const ownerKey = `${supervisor.accountId}:${supervisor.employeeId}`;

  const [screen, setScreen] = useState<Screen>("drafts");
  const [activeStep, setActiveStep] = useState(0);
  const [rows, setRows] = useState<ShopDelivery[]>([]);
  const [bootstrap, setBootstrap] = useState<MobileBootstrap | null>(null);
  const [bootstrapLoading, setBootstrapLoading] = useState(true);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [draftsLoading, setDraftsLoading] = useState(true);
  const [draftsError, setDraftsError] = useState<string | null>(null);
  const [serverDrafts, setServerDrafts] = useState<Trip[]>([]);
  const [cachedDrafts, setCachedDrafts] = useState<Trip[]>([]);
  const [workingDraft, setWorkingDraft] = useState<MobileWorkingDraft | null>(null);
  const [clientDraftId, setClientDraftId] = useState(() => newMobileOperationId());
  const [storageReady, setStorageReady] = useState(false);

  const refreshDrafts = useCallback(async () => {
    if (!navigator.onLine) {
      const saved = await loadCachedDrafts(ownerKey);
      setCachedDrafts(saved);
      setDraftsLoading(false);
      return saved;
    }
    setDraftsLoading(true);
    setDraftsError(null);
    try {
      await mobileHealth();
      const latest = await listMobileDrafts();
      setServerDrafts(latest);
      setCachedDrafts(latest);
      await cacheDrafts(ownerKey, latest);
      return latest;
    } catch (error) {
      const apiError = asMobileApiError(error);
      setDraftsError(apiError.message);
      const saved = await loadCachedDrafts(ownerKey);
      setCachedDrafts(saved);
      return saved;
    } finally {
      setDraftsLoading(false);
    }
  }, [ownerKey]);

  const onTripsChanged = useCallback(() => {
    void refreshDrafts();
  }, [refreshDrafts]);

  const {
    trip,
    savedTrip,
    setTrip,
    setIsEditing,
    headerLoading,
    subscribeHeaderSaveStatus,
    getHeaderSaveStatus,
    updateTrip,
    updateDeliveries,
    updateBoxDetails,
    loadTrip,
    clearTrip,
    updateStartTrip,
  } = useTripEntry(showNotification, onTripsChanged);

  const handleAuthoritativeTrip = useCallback(
    (authoritative: MobileTrip) => {
      loadTrip(authoritative);
      setRows(authoritative.deliveries || []);
      setWorkingDraft({
        version: 2,
        ownerKey,
        clientDraftId,
        trip: authoritative,
        activeStep: getNextIncompleteTripStep(authoritative),
        serverVersion: authoritative.version,
        savedAt: new Date().toISOString(),
      });
    },
    [clientDraftId, loadTrip, ownerKey]
  );

  const handlePendingTrip = useCallback(
    (authoritative: MobileTrip) => {
      setServerDrafts((current) => current.filter((item) => item.id !== authoritative.id));
      setCachedDrafts((current) => current.filter((item) => item.id !== authoritative.id));
      setWorkingDraft(null);
      if (trip.id === authoritative.id || (!trip.id && clientDraftId)) {
        clearTrip();
        setRows([]);
        setScreen("drafts");
      }
    }, [clearTrip, clientDraftId, trip.id]
  );

  const sync = useDurableMobileSync({
    ownerKey,
    clientDraftId,
    trip,
    activeStep,
    onLocalTrip: (localTrip) => {
      loadTrip(localTrip);
      setRows(localTrip.deliveries || []);
      setWorkingDraft({
        version: 2,
        ownerKey,
        clientDraftId,
        trip: localTrip,
        activeStep: getNextIncompleteTripStep(localTrip),
        serverVersion: tripVersion(localTrip),
        savedAt: new Date().toISOString(),
      });
    },
    onAuthoritativeTrip: handleAuthoritativeTrip,
    onPendingTripSubmitted: handlePendingTrip,
    onUnauthorized: logout,
    refreshDrafts,
    notify: showNotification,
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [savedWorking, savedDrafts, savedBootstrap] = await Promise.all([
        loadWorkingDraft(ownerKey),
        loadCachedDrafts(ownerKey),
        loadCachedBootstrap(ownerKey),
      ]);
      if (cancelled) return;
      setCachedDrafts(savedDrafts);
      if (savedBootstrap) setBootstrap(savedBootstrap);
      if (savedWorking && isActualDraft(savedWorking.trip)) {
        setClientDraftId(savedWorking.clientDraftId);
        setWorkingDraft(savedWorking);
      }
      setStorageReady(true);

      if (navigator.onLine) {
        try {
          await mobileHealth();
          const latestBootstrap = await loadMobileBootstrap();
          if (!cancelled) {
            setBootstrap(latestBootstrap);
            setBootstrapError(null);
            await cacheBootstrap(ownerKey, latestBootstrap);
          }
        } catch (error) {
          if (!cancelled) setBootstrapError(asMobileApiError(error).message);
        }
      }
      if (!cancelled) setBootstrapLoading(false);
      await refreshDrafts();
    })();
    return () => {
      cancelled = true;
    };
  }, [ownerKey, refreshDrafts]);

  useEffect(() => {
    if (!storageReady || screen !== "wizard" || !isActualDraft(trip) || !hasTripWork(trip)) return;
    const timer = window.setTimeout(() => {
      void saveWorkingDraft(ownerKey, {
        clientDraftId,
        trip,
        activeStep,
        serverVersion: tripVersion(trip),
      }).then(setWorkingDraft);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [activeStep, clientDraftId, ownerKey, screen, storageReady, trip]);

  const checkOfficeReachability = sync.checkOffice;
  useEffect(() => {
    void checkOfficeReachability();
  }, [checkOfficeReachability]);

  useEffect(() => {
    if (import.meta.env.PROD && "serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/mobile-sw.js").catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    if (
      sync.officeReachability !== "reachable" ||
      !workingDraft ||
      workingDraft.trip.id <= 0 ||
      serverDrafts.some((item) => item.id === workingDraft.trip.id)
    ) {
      return;
    }
    let cancelled = false;
    void loadMobileTrip(workingDraft.trip.id)
      .then(async (authoritative) => {
        if (cancelled || authoritative.status === "Draft") return;
        await clearWorkingDraft(ownerKey);
        await removeCachedDraft(ownerKey, authoritative.id);
        setWorkingDraft(null);
        setCachedDrafts((current) => current.filter((item) => item.id !== authoritative.id));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [ownerKey, serverDrafts, sync.officeReachability, workingDraft]);

  const remoteSource = sync.officeReachability === "reachable" && !draftsError
    ? serverDrafts
    : cachedDrafts;
  const recentDrafts = useMemo(
    () => mergeDraftSnapshots(remoteSource, workingDraft),
    [remoteSource, workingDraft]
  );

  const vehicles = useMemo(() => bootstrap?.vehicles ?? [], [bootstrap?.vehicles]);
  const employees = useMemo(() => bootstrap?.employees ?? [], [bootstrap?.employees]);
  const farms = useMemo(() => bootstrap?.farms ?? [], [bootstrap?.farms]);
  const shops = useMemo(() => bootstrap?.shops ?? [], [bootstrap?.shops]);
  const birdTypes = useMemo(() => bootstrap?.birdTypes ?? [], [bootstrap?.birdTypes]);
  const supervisorEmployee = useMemo(
    () =>
      employees.find((employee) => employee.id === supervisor.employeeId) ?? {
        id: supervisor.employeeId,
        employeeName: supervisor.employeeName,
        department: supervisor.department,
        role: supervisor.role,
        status: "Active",
      },
    [employees, supervisor]
  );

  const startCompleted = Boolean(trip.startStepSubmitted);
  const farmCompleted = Boolean(trip.farmStepSubmitted);
  const pickupCompleted = Boolean(trip.pickupStepSubmitted);
  const deliveryCompleted = Boolean(trip.deliveryStepSubmitted);
  const tripEnded = hasTripEnded(trip);
  const currentStep = getNextIncompleteTripStep(trip);

  useEffect(() => {
    if (screen !== "wizard" || currentStep <= activeStep) return;
    const timer = window.setTimeout(() => setActiveStep(currentStep), 0);
    return () => window.clearTimeout(timer);
  }, [activeStep, currentStep, screen]);

  const vehicleOptions = useMemo(
    () => vehicles.map((vehicle) => ({ id: vehicle.id, vehicleNumber: vehicle.vehicleNumber })),
    [vehicles]
  );
  const employeeOptions = useMemo(
    () => employees.map((employee) => ({
      id: employee.id,
      employeeName: employee.employeeName,
      department: employee.department,
    })),
    [employees]
  );

  const mobileSubmitStart = useCallback(
    async (data: Partial<Trip>): Promise<boolean> => {
      const localTrip: Trip = {
        ...trip,
        ...data,
        supervisorId: supervisor.employeeId,
        supervisorName: supervisor.employeeName,
        startStepSubmitted: true,
        startTime: trip.startTime || new Date().toISOString(),
        status: "Draft",
      };
      const validation = validateStartStep(localTrip);
      if (!validation.valid) {
        showNotification(validation.errors[0], "error");
        return false;
      }
      return isCommitAccepted(await sync.commit("start", "submit", localTrip));
    }, [showNotification, supervisor.employeeId, supervisor.employeeName, sync, trip]
  );

  const mobileSaveStart = useCallback(
    async (data: Partial<Trip>) =>
      isCommitAccepted(await sync.commit("start", "save", { ...trip, ...data, status: "Draft" })),
    [sync, trip]
  );

  const mobileSubmitFarm = useCallback(
    async (data: Partial<Trip>): Promise<boolean> => {
      const localTrip: Trip = {
        ...trip,
        ...data,
        reachedTime: trip.reachedTime || new Date().toISOString(),
        farmStepSubmitted: true,
        status: "Draft",
      };
      const validation = validateFarmStep(localTrip);
      if (!validation.valid) {
        showNotification(validation.errors[0], "error");
        return false;
      }
      return isCommitAccepted(await sync.commit("farm", "submit", localTrip));
    }, [showNotification, sync, trip]
  );

  const mobileSaveFarm = useCallback(
    async (data: Partial<Trip>) =>
      isCommitAccepted(await sync.commit("farm", "save", { ...trip, ...data, status: "Draft" })),
    [sync, trip]
  );

  const mobileSubmitPickup = useCallback(
    async (data: Partial<Trip>): Promise<boolean> => {
      const localTrip: Trip = {
        ...trip,
        ...data,
        pickupLoadTime: trip.pickupLoadTime || "",
        pickupStepSubmitted: true,
        status: "Draft",
      };
      const validation = validatePickupStep(localTrip);
      if (!validation.valid) {
        showNotification(validation.errors[0], "error");
        return false;
      }
      return isCommitAccepted(await sync.commit("pickup", "submit", localTrip));
    }, [showNotification, sync, trip]
  );

  const mobileSavePickup = useCallback(
    async (data: Partial<Trip>) =>
      isCommitAccepted(await sync.commit("pickup", "save", { ...trip, ...data, status: "Draft" })),
    [sync, trip]
  );

  const mobileSubmitDeliveries = useCallback(async () => {
    const localTrip = {
      ...applyDeliveryMetrics(trip, rows),
      deliveryStepSubmitted: true,
      status: "Draft" as const,
    };
    return isCommitAccepted(await sync.commit("deliveries", "submit", localTrip));
  }, [rows, sync, trip]);

  const mobileSaveDeliveries = useCallback(
    async (deliveryRows: ShopDelivery[]) => {
      const localTrip = applyDeliveryMetrics(trip, deliveryRows);
      return isCommitAccepted(await sync.commit("deliveries", "save", localTrip));
    },
    [sync, trip]
  );

  const mobileSubmitEnd = useCallback(
    async (data: Partial<Trip>) => {
      const queuedTrip: Trip = {
        ...trip,
        ...data,
        endTime: trip.endTime || new Date().toISOString(),
        // PostgreSQL is the only authority allowed to transition this to Pending.
        status: "Draft",
        endStepSubmitted: false,
        expensesStepSubmitted: false,
      };
      return isCommitAccepted(await sync.commit("expenses", "submit", queuedTrip));
    }, [sync, trip]
  );

  const mobileSaveEnd = useCallback(
    async (data: Partial<Trip>) =>
      isCommitAccepted(await sync.commit("expenses", "save", {
        ...trip,
        ...data,
        status: "Draft",
        endStepSubmitted: false,
        expensesStepSubmitted: false,
      })),
    [sync, trip]
  );

  const createNewTrip = useCallback(() => {
    if (workingDraft && isActualDraft(workingDraft.trip)) {
      showNotification("Resume or finish the existing device draft before starting another Trip.", "info");
      return;
    }
    const nextClientDraftId = newMobileOperationId();
    setClientDraftId(nextClientDraftId);
    clearTrip();
    setRows([]);
    setTrip((previous) => ({
      ...previous,
      tripDate: yesterday(),
      supervisorId: supervisorEmployee.id,
      supervisorName: supervisorEmployee.employeeName,
      status: "Draft",
    }));
    setIsEditing(true);
    setActiveStep(0);
    setScreen("wizard");
  }, [clearTrip, setIsEditing, setTrip, showNotification, supervisorEmployee, workingDraft]);

  const resumeDraft = useCallback(
    async (selected: Trip) => {
      let selectedDraft = selected;
      setBootstrapError(null);
      try {
        const stored = await loadWorkingDraft(ownerKey);
        if (
          stored &&
          ((selected.id > 0 && stored.trip.id === selected.id) || selected.id <= 0)
        ) {
          selectedDraft = stored.trip;
          setClientDraftId(stored.clientDraftId);
          setWorkingDraft(stored);
        } else if (navigator.onLine && selected.id > 0) {
          await mobileHealth();
          const latest = await loadMobileTrip(selected.id);
          if (!isActualDraft(latest)) {
            await removeCachedDraft(ownerKey, selected.id);
            setServerDrafts((current) => current.filter((item) => item.id !== selected.id));
            setCachedDrafts((current) => current.filter((item) => item.id !== selected.id));
            showNotification(`${latest.tripNo} is now ${latest.status} and was removed from Drafts.`, "info");
            return;
          }
          selectedDraft = latest;
          setClientDraftId(newMobileOperationId());
        }
        loadTrip(selectedDraft);
        setRows(selectedDraft.deliveries || []);
        setIsEditing(true);
        setActiveStep(getNextIncompleteTripStep(selectedDraft));
        setScreen("wizard");
      } catch (error) {
        showNotification(asMobileApiError(error).message, "error");
      }
    }, [loadTrip, ownerKey, setIsEditing, showNotification]
  );

  const closeToDrafts = useCallback(() => {
    if (isActualDraft(trip) && hasTripWork(trip)) {
      void saveWorkingDraft(ownerKey, {
        clientDraftId,
        trip,
        activeStep,
        serverVersion: tripVersion(trip),
      }).then(setWorkingDraft);
    }
    clearTrip();
    setRows([]);
    setActiveStep(0);
    setScreen("drafts");
    void refreshDrafts();
  }, [activeStep, clearTrip, clientDraftId, ownerKey, refreshDrafts, trip]);

  const syncState: MobileSyncState = !sync.browserOnline
    ? "offline"
    : sync.conflictMessage
      ? "conflict"
      : sync.syncing || sync.officeReachability === "checking" || headerLoading
        ? "syncing"
        : sync.officeReachability === "unreachable" && sync.operations.length > 0
          ? "waiting-office"
          : sync.syncError
            ? "failed"
            : sync.operations.length > 0
              ? "local"
              : sync.officeReachability === "reachable"
                ? "synced"
                : "waiting-office";

  const isEditable = (stepCompleted: boolean) => {
    if (trip.status !== "Draft" || sync.conflictMessage) return false;
    return activeStep === currentStep && !stepCompleted;
  };

  const renderStep = () => {
    if (activeStep === 0) {
      return (
        <StepStart
          tripId={trip.id}
          startTime={trip.startTime}
          startStepSubmitted={trip.startStepSubmitted}
          loadSnapshot={trip}
          updateTrip={updateStartTrip}
          submitStartStep={mobileSubmitStart}
          saveStartProgress={mobileSaveStart}
          hasUnsavedChanges={JSON.stringify({
            vehicleId: trip.vehicleId,
            driverId: trip.driverId,
            helpers: trip.helpers,
            loaders: trip.loaders,
            openingMeter: trip.openingMeter,
            advanceAmount: trip.advanceAmount,
          }) !== JSON.stringify({
            vehicleId: savedTrip.vehicleId,
            driverId: savedTrip.driverId,
            helpers: savedTrip.helpers,
            loaders: savedTrip.loaders,
            openingMeter: savedTrip.openingMeter,
            advanceAmount: savedTrip.advanceAmount,
          })}
          vehicleOptions={vehicleOptions}
          employeeOptions={employeeOptions}
          editable={isEditable(startCompleted)}
          canEdit={false}
          onCancel={closeToDrafts}
          clearForm={closeToDrafts}
          headerLoading={headerLoading}
          subscribeHeaderSaveStatus={subscribeHeaderSaveStatus}
          getHeaderSaveStatus={getHeaderSaveStatus}
        />
      );
    }
    if (activeStep === 1) {
      return (
        <StepFarm
          trip={trip}
          setTrip={setTrip}
          updateTrip={updateTrip}
          submitFarmStep={mobileSubmitFarm}
          saveFarmProgress={mobileSaveFarm}
          hasUnsavedChanges
          farms={farms}
          editable={isEditable(farmCompleted)}
          canEdit={false}
          onCancel={closeToDrafts}
          showNotification={(message, type) =>
            showNotification(message, type === "warning" ? "info" : type)
          }
        />
      );
    }
    if (activeStep === 2) {
      return (
        <StepPickup
          trip={trip}
          setTrip={setTrip}
          updateTrip={updateTrip}
          submitPickupStep={mobileSubmitPickup}
          savePickupProgress={mobileSavePickup}
          updateBoxDetails={updateBoxDetails}
          editable={isEditable(pickupCompleted)}
          canEdit={false}
          onCancel={closeToDrafts}
          clearForm={closeToDrafts}
        />
      );
    }
    if (activeStep === 3) {
      return (
        <StepDeliveries
          rows={rows}
          setRows={setRows}
          shops={shops}
          birdTypes={birdTypes}
          trip={trip}
          updateDeliveries={updateDeliveries}
          submitDeliveriesStep={mobileSubmitDeliveries}
          saveDeliveriesProgress={mobileSaveDeliveries}
          clearForm={closeToDrafts}
          readOnly={!isEditable(deliveryCompleted)}
          editable={isEditable(deliveryCompleted)}
          canEdit={false}
          onCancel={closeToDrafts}
          boxDetails={trip.boxDetails || []}
        />
      );
    }
    return (
      <StepEnd
        trip={trip}
        setTrip={setTrip}
        updateTrip={updateTrip}
        editable={isEditable(tripEnded)}
        canEdit={false}
        onCancel={closeToDrafts}
        clearForm={closeToDrafts}
        submitExpensesStep={mobileSubmitEnd}
        saveEndProgress={mobileSaveEnd}
      />
    );
  };

  const canMoveBack = activeStep > 0;
  const canMoveForward = activeStep < currentStep && activeStep < 4;

  return (
    <main className="mobile-trip-app min-h-dvh bg-slate-100 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-slate-900">
      <header className="sticky top-0 z-40 border-b border-emerald-900/10 bg-emerald-950 text-white shadow-lg shadow-emerald-950/10">
        <div className="mx-auto flex min-h-[68px] max-w-3xl items-center justify-between gap-3 px-4 pt-[env(safe-area-inset-top)]">
          <div className="flex min-w-0 items-center gap-3">
            {screen === "wizard" ? (
              <button
                type="button"
                onClick={closeToDrafts}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white ring-1 ring-inset ring-white/10"
                aria-label="Back to recent drafts"
              >
                <ArrowLeft size={18} />
              </button>
            ) : (
              <BrandMark size="md" />
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-extrabold tracking-tight">
                {screen === "wizard" ? trip.tripNo || "New Trip" : "DMR Poultries"}
              </p>
              <p className="truncate text-[11px] font-medium text-emerald-200/80">
                {screen === "wizard" ? `Step ${activeStep + 1} of 5 · Trip Entry` : "Supervisor Trip Entry"}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <MobileSyncIndicator state={syncState} onRetry={() => void sync.retry()} />
            <button
              type="button"
              onClick={() => void logout()}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-emerald-50 ring-1 ring-inset ring-white/10"
              aria-label="Secure logout"
              title="Logout"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-3xl px-3.5 py-4 sm:px-5">
        {screen === "drafts" ? (
          <div className="space-y-4">
            <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-800 via-emerald-900 to-emerald-950 p-5 text-white shadow-card-lg">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs font-semibold text-emerald-200">
                    <UserRound size={14} /> Authenticated Supervisor
                  </div>
                  <h1 className="mt-2 truncate text-xl font-extrabold tracking-tight">{supervisor.employeeName}</h1>
                  <p className="mt-1 text-xs leading-relaxed text-emerald-100/70">
                    Create, resume and synchronize Trip Entry Steps 1–5.
                  </p>
                </div>
                <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold text-emerald-100 ring-1 ring-inset ring-white/10">
                  {supervisor.role}
                </span>
              </div>
              <button
                type="button"
                onClick={createNewTrip}
                disabled={bootstrapLoading || !bootstrap}
                className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-white text-sm font-extrabold text-emerald-900 shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
              >
                <FilePlus2 size={18} /> Start New Trip
              </button>
            </section>

            {(bootstrapError || draftsError) && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-xs font-medium leading-relaxed text-amber-800">
                {sync.officeReachability === "unreachable"
                  ? "Phone connectivity is available, but the office backend is not reachable. Work remains saved locally."
                  : bootstrapError || draftsError}
              </div>
            )}

            <RecentDraftsList
              drafts={recentDrafts}
              loading={draftsLoading && !storageReady}
              stale={sync.officeReachability !== "reachable" || Boolean(draftsError)}
              onRefresh={() => void refreshDrafts()}
              onResume={(selected) => void resumeDraft(selected)}
            />
          </div>
        ) : (
          <div className="space-y-4">
            <section className="rounded-3xl border border-slate-200/80 bg-white p-3 shadow-card-lg sm:p-5">
              <TripWizardStepper
                steps={TRIP_STEP_LABELS}
                currentStep={tripEnded ? 4 : currentStep}
                completedMask={{
                  start: startCompleted,
                  farm: farmCompleted,
                  pickup: pickupCompleted,
                  delivery: deliveryCompleted,
                }}
                onStepClick={(index) => setActiveStep(index)}
              />

              {sync.operations.length > 0 && !sync.conflictMessage && (
                <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs font-medium leading-relaxed text-amber-800">
                  Saved locally. Waiting for an authenticated acknowledgement from the office database.
                </div>
              )}

              {sync.conflictMessage && (
                <div className="mb-3 rounded-2xl border border-rose-200 bg-rose-50 p-3.5">
                  <p className="text-xs font-semibold leading-relaxed text-rose-800">
                    {sync.conflictMessage}
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-rose-700">
                    The conflicting local operation remains on this device. It will not be retried or overwritten automatically.
                  </p>
                </div>
              )}

              <div className="mobile-step-surface">{renderStep()}</div>

              <nav className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4" aria-label="Trip step navigation">
                <button
                  type="button"
                  disabled={!canMoveBack}
                  onClick={() => setActiveStep((step) => Math.max(0, step - 1))}
                  className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 disabled:opacity-40"
                >
                  <ChevronLeft size={16} /> Back
                </button>
                <button
                  type="button"
                  disabled={!canMoveForward}
                  onClick={() => setActiveStep((step) => Math.min(currentStep, step + 1))}
                  className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 text-xs font-bold text-white disabled:bg-slate-200 disabled:text-slate-400"
                >
                  Next <ChevronRight size={16} />
                </button>
              </nav>
            </section>

            {startCompleted && <TripFinalKPI trip={trip} deliveries={rows} />}
          </div>
        )}
      </div>
    </main>
  );
}
