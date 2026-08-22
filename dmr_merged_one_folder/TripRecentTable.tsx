// src/modules/operations/vehicle-trips/components/TripRecentTable.tsx

import React, { useState, useRef, useEffect, useMemo } from "react";
import { Eye, Pencil, RefreshCw, History, Trash2, Clock, Layers, AlertCircle, Search, FileText, CheckCircle } from "lucide-react";
import type { Trip } from "../types/trip";
import { canEditItem, canDeleteItem } from "../../../../utils/dateUtils";
import { formatTripRecentDateWithDay } from "../utils/formatTripListDay";
import TripPagination from "./TripPagination";
import { shouldShowPagination } from "../../../../shared/ui/paginationStyles";
import { usePendingDelete } from "../../../../hooks/usePendingDelete";
import { PendingDeleteNotification } from "../../../../components/common/PendingDeleteNotification";
import { getNextIncompleteTripStep, TRIP_STEP_LABELS } from "../../../../shared/trip";

interface Props {
  trips?: Trip[];
  onRefresh: () => void;
  onView: (trip: Trip) => void;
  onEdit: (trip: Trip) => void;
  onResume?: (trip: Trip) => void;
  onDelete?: (trip: Trip, reason: string) => void;
  // ✅ Updated: accept optional approvedBy parameter
  onStatusChange?: (trip: Trip, status: "Pending" | "Completed", approvedBy?: string) => void;
}

function TripRecentTable({
  trips = [],
  onRefresh,
  onView,
  onEdit,
  onResume,
  onDelete,
  onStatusChange,
}: Props) {
  const safeTrips = Array.isArray(trips) ? trips : [];

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTripId, setSelectedTripId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<"All" | "Draft" | "Pending" | "Deleted">("Draft");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const [tripToDelete, setTripToDelete] = useState<Trip | null>(null);
  const pendingDeletesRef = useRef<Map<number, { trip: Trip; reason: string }>>(new Map());
  const onDeleteRef = useRef(onDelete);
  onDeleteRef.current = onDelete;

  const { requestDelete, cancel, isPending, pendingItems } = usePendingDelete<number>(async (id) => {
    const pending = pendingDeletesRef.current.get(id);
    pendingDeletesRef.current.delete(id);
    const trip = pending?.trip ?? safeTrips.find((t) => Number(t.id) === Number(id)) ?? ({ id } as Trip);
    const reason = pending?.reason ?? "";
    const deleteFn = onDeleteRef.current;
    if (deleteFn) await Promise.resolve(deleteFn(trip, reason));
    setSelectedTripId(null);
  });

  const tableRef = useRef<HTMLDivElement>(null);

  // ✅ Get current user name (or fallback to "Admin")
  const getCurrentUser = () => {
    try {
      const user = localStorage.getItem("user");
      return user ? JSON.parse(user).name : "Admin";
    } catch {
      return "Admin";
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tableRef.current && !tableRef.current.contains(event.target as Node)) {
        setSelectedTripId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filterBySearch = (trips: Trip[]) => {
    if (!searchTerm.trim()) return trips;
    const lower = searchTerm.toLowerCase();
    return trips.filter((t) =>
      t.tripNo.toLowerCase().includes(lower) ||
      t.tripDate.includes(lower) ||
      t.vehicleNo.toLowerCase().includes(lower) ||
      t.driverName.toLowerCase().includes(lower) ||
      t.supervisorName.toLowerCase().includes(lower) ||
      t.sourceFarm.toLowerCase().includes(lower)
    );
  };

  const sortedTrips = useMemo(() => {
    const filtered = filterBySearch(safeTrips);
    return [...filtered].sort((a, b) => {
      if (a.tripDate !== b.tripDate) return a.tripDate < b.tripDate ? 1 : -1;
      return b.id - a.id;
    });
  }, [safeTrips, searchTerm]);

  const allDraft = sortedTrips.filter((t) => !t.deleted && t.status === "Draft");
  const allPending = sortedTrips.filter((t) => !t.deleted && t.status === "Pending");
  const allApproved = sortedTrips.filter((t) => !t.deleted && t.status === "Completed");
  const allDeleted = sortedTrips.filter((t) => t.deleted === true || t.status === "Deleted");

  const draftCount = allDraft.length;
  const pendingCount = allPending.length;
  const approvedCount = allApproved.length;
  const deletedCount = allDeleted.length;

  let filteredTrips: Trip[] = [];
  if (statusFilter === "All") filteredTrips = [...allDraft, ...allPending, ...allApproved, ...allDeleted];
  else if (statusFilter === "Draft") filteredTrips = allDraft;
  else if (statusFilter === "Pending") filteredTrips = allPending;
  else filteredTrips = allDeleted;

  const totalPages = Math.ceil(filteredTrips.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedTrips = filteredTrips.slice(startIndex, startIndex + pageSize);

  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, searchTerm]);

  const selectedTrip = safeTrips.find((t) => t.id === selectedTripId) || null;

  const canEdit = selectedTrip
    ? canEditItem(selectedTrip.createdAt || "") && !selectedTrip.deleted
    : false;
  const canDelete = selectedTrip
    ? canDeleteItem(selectedTrip.createdAt || "") && !selectedTrip.deleted && !!onDelete && !isPending(Number(selectedTrip.id))
    : false;

  const handleRowClick = (trip: Trip) => {
    if (trip.deleted) return;
    if (isPending(Number(trip.id))) return;
    setSelectedTripId(trip.id === selectedTripId ? null : trip.id);
  };

  const handleEditClick = () => {
    if (selectedTrip) onEdit(selectedTrip);
  };

  const openDeleteModal = () => {
    if (!selectedTrip) return;
    setTripToDelete(selectedTrip);
    setDeleteReason("");
    setShowDeleteModal(true);
  };

  const confirmDelete = () => {
    if (!tripToDelete || deleteReason.trim() === "") return alert("Please provide a reason for deletion.");
    const id = Number(tripToDelete.id);
    if (!Number.isFinite(id) || id <= 0) return;
    const reason = deleteReason.trim();
    const trip = tripToDelete;
    setShowDeleteModal(false);
    setTripToDelete(null);
    setDeleteReason("");
    if (isPending(id)) return;
    pendingDeletesRef.current.set(id, { trip, reason });
    requestDelete(id, { label: `Deleting trip ${trip.tripNo}` });
  };

  const cancelDelete = () => {
    setShowDeleteModal(false);
    setTripToDelete(null);
    setDeleteReason("");
  };

  const getStepBadge = (trip: Trip) => {
    if (trip.status === "Completed") {
      return { label: "Completed", color: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: <CheckCircle size={12} />, resume: false };
    }
    if (trip.status === "Pending") {
      return { label: "Pending", color: "bg-amber-50 text-amber-700 border-amber-200", icon: <Clock size={12} />, resume: false };
    }
    // A Draft trip always has Step 1 submitted (trips are created on Step 1
    // submit), so it is always mid-workflow: show which step is pending next.
    const nextStep = getNextIncompleteTripStep(trip);
    const stepLabel = TRIP_STEP_LABELS[nextStep] ?? `Step ${nextStep + 1}`;
    return {
      label: `In Progress · Step ${nextStep + 1}: ${stepLabel}`,
      color: "bg-blue-50 text-blue-700 border-blue-200",
      icon: <FileText size={12} />,
      resume: true,
    };
  };

  // ✅ Handle status change with approver name
  const handleStatusChange = (trip: Trip, newStatus: "Pending" | "Completed") => {
    if (newStatus === "Completed") {
      const approver = getCurrentUser();
      if (onStatusChange) onStatusChange(trip, "Completed", approver);
    } else {
      if (onStatusChange) onStatusChange(trip, "Pending");
    }
  };

  return (
    <>
      <div ref={tableRef} className="bg-white rounded-2xl border border-slate-200/80 shadow-xl shadow-slate-100 overflow-hidden mt-8 transition-all duration-300">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-6 py-3 border-b border-slate-100 bg-gradient-to-r from-slate-50 via-white to-slate-50">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shadow-inner">
              <History className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-800 tracking-tight">Recent Trip Activity</h3>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input type="text" placeholder="Search trips..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-48 pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-xl bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all" />
            </div>

            <div className="bg-slate-100/80 p-1 rounded-xl flex items-center gap-1 border border-slate-200/60">
              {(["Draft", "Pending", "Deleted", "All"] as const).map((tab) => {
                const isActive = statusFilter === tab;
                let count = 0, Icon = Layers;
                if (tab === "Draft") { count = draftCount; Icon = FileText; }
                if (tab === "Pending") { count = pendingCount; Icon = Clock; }
                if (tab === "Deleted") { count = deletedCount; Icon = AlertCircle; }
                if (tab === "All") { count = draftCount + pendingCount + approvedCount + deletedCount; Icon = Layers; }
                return (
                  <button key={tab} onClick={() => setStatusFilter(tab)} className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all duration-200 flex items-center gap-1 ${isActive ? "bg-white text-blue-700 shadow-sm border border-slate-200/50" : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"}`}>
                    <Icon size={11} className={isActive ? (tab === "Deleted" ? "text-rose-500" : "text-blue-500") : "text-slate-400"} />
                    <span>{tab}</span>
                    <span className={`ml-0.5 px-1 py-0.2 rounded-full text-[10px] ${isActive ? "bg-slate-100 text-slate-700" : "bg-slate-200/60 text-slate-500"}`}>{count}</span>
                  </button>
                );
              })}
            </div>

            <div className="h-5 w-px bg-slate-200 hidden sm:block" />

            <div className="flex items-center gap-1">
              <button onClick={handleEditClick} disabled={!canEdit} className={`h-8 px-2.5 rounded-xl font-medium text-xs flex items-center gap-1 transition-all shadow-sm ${canEdit ? "bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200/60 active:scale-95" : "bg-slate-50 text-slate-300 border border-slate-100 cursor-not-allowed"}`} title="Edit selected trip">
                <Pencil size={13} />
                <span className="hidden md:inline">Edit</span>
              </button>
              <button onClick={openDeleteModal} disabled={!canDelete} className={`h-8 px-2.5 rounded-xl font-medium text-xs flex items-center gap-1 transition-all shadow-sm ${canDelete ? "bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200/60 active:scale-95" : "bg-slate-50 text-slate-300 border border-slate-100 cursor-not-allowed"}`} title="Delete selected trip">
                <Trash2 size={13} />
                <span className="hidden md:inline">Delete</span>
              </button>
              <button onClick={() => onRefresh()} className="h-8 w-8 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 flex items-center justify-center transition-all shadow-sm active:scale-95 hover:border-slate-300" title="Refresh list">
                <RefreshCw size={13} className="text-slate-600 transition-transform active:rotate-180" />
              </button>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm text-left border-collapse">
            <thead className="bg-slate-50/75 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider">Trip No</th>
                <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider">Day</th>
                <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider">Vehicle</th>
                <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider">Driver</th>
                <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider">Supervisor</th>
                <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider">Source Farm</th>
                <th className="px-4 py-3 text-center text-[11px] font-bold uppercase tracking-wider">Shops</th>
                <th className="px-4 py-3 text-center text-[11px] font-bold uppercase tracking-wider">Birds</th>
                <th className="px-4 py-3 text-center text-[11px] font-bold uppercase tracking-wider">Weight (KG)</th>
                <th className="px-4 py-3 text-center text-[11px] font-bold uppercase tracking-wider">Mortality</th>
                <th className="px-4 py-3 text-center text-[11px] font-bold uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-center text-[11px] font-bold uppercase tracking-wider">View</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedTrips.length === 0 ? (
                <tr><td colSpan={12} className="py-16 text-center text-slate-400"><History size={24} className="mx-auto mb-2" /> No trips found.</td></tr>
              ) : (
                paginatedTrips.map((trip) => {
                  const isSelected = trip.id === selectedTripId;
                  const isDeleted = trip.deleted === true;
                  const isApproved = trip.status === "Completed";
                  const showDropdown = !isDeleted && onStatusChange && trip.status === "Pending" && !isApproved;

                  return (
                    <tr key={trip.id} onClick={() => handleRowClick(trip)} className={`cursor-pointer transition-all duration-150 group ${isDeleted ? "bg-rose-50/40 hover:bg-rose-50/70 border-l-4 border-l-rose-400" : isSelected ? "bg-blue-50/80 shadow-inner border-l-4 border-l-blue-600" : "hover:bg-slate-50/80"}`}>
                      <td className="px-4 py-3 font-bold text-emerald-700 text-xs">
                        <span className={`bg-emerald-50 px-2 py-1 rounded-md border border-emerald-100/80 ${isDeleted ? "opacity-60 line-through" : ""}`}>{trip.tripNo}</span>
                      </td>
                      <td className="px-4 py-3 text-xs font-medium text-slate-600 whitespace-nowrap">{formatTripRecentDateWithDay(trip.tripDate)}</td>
                      <td className="px-4 py-3 text-xs font-medium text-slate-700">{trip.vehicleNo}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">{trip.driverName}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">{trip.supervisorName}</td>
                      <td className="px-4 py-3 text-xs text-slate-600 font-medium">{trip.sourceFarm}</td>
                      <td className="px-4 py-3 text-center text-xs font-bold text-slate-700">{trip.totalShops}</td>
                      <td className="px-4 py-3 text-center text-xs font-bold text-blue-700">{trip.totalBirds.toLocaleString()}</td>
                      <td className="px-4 py-3 text-center text-xs font-bold text-amber-600">{trip.totalWeight.toFixed(2)}</td>
                      <td className="px-4 py-3 text-center text-xs font-bold text-rose-600">{trip.totalMortality}</td>
                      <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        {isDeleted ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold tracking-wide shadow-sm bg-rose-100 text-rose-700 border border-rose-200/80"><AlertCircle size={12} /> Deleted</span>
                        ) : showDropdown ? (
                          <div className="relative inline-block w-32">
                            <select
                              value={trip.status}
                              onChange={(e) => handleStatusChange(trip, e.target.value as "Pending" | "Completed")}
                              className={`w-full appearance-none rounded-xl px-3 py-1.5 text-xs font-bold border transition-all shadow-sm cursor-pointer pr-8 focus:outline-none focus:ring-2 focus:ring-offset-1 ${
                                trip.status === "Completed"
                                  ? "text-emerald-700 border-emerald-300 bg-emerald-50/80 focus:ring-emerald-500"
                                  : "text-amber-700 border-amber-300 bg-amber-50/80 focus:ring-amber-500"
                              }`}
                            >
                              <option value="Pending" className="text-amber-700 font-semibold bg-white">⏳ Pending</option>
                              <option value="Completed" className="text-emerald-700 font-semibold bg-white">✅ Completed</option>
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-slate-500">
                              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                              </svg>
                            </div>
                          </div>
                        ) : (
                          (() => {
                            const badge = getStepBadge(trip);
                            return (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (badge.resume && onResume) onResume(trip);
                                }}
                                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold tracking-wide shadow-sm border ${badge.resume ? "cursor-pointer hover:shadow-md hover:scale-105 active:scale-95" : "cursor-default"} transition-all duration-200 ${badge.color}`}
                              >
                                {badge.icon}
                                {badge.label}
                              </button>
                            );
                          })()
                        )}
                      </td>
                      <td className="text-center px-4 py-3">
                        <button onClick={(e) => { e.stopPropagation(); onView(trip); }} className="h-8 w-8 rounded-xl bg-blue-50 hover:bg-blue-600 text-blue-600 hover:text-white flex items-center justify-center mx-auto transition-all shadow-sm active:scale-95 group-hover:border-blue-200" title="View Trip Details"><Eye size={14} /></button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {shouldShowPagination(filteredTrips.length) && (
          <TripPagination
            currentPage={currentPage}
            totalPages={Math.max(totalPages, 1)}
            onPageChange={setCurrentPage}
          />
        )}
      </div>

      <PendingDeleteNotification
        items={pendingItems}
        onCancel={(id) => {
          pendingDeletesRef.current.delete(id);
          cancel(id);
        }}
      />

      {/* Delete Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm transition-opacity">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200/80 max-w-md w-full mx-4 p-6">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600"><Trash2 size={20} /></div>
              <div className="flex-1"><h3 className="text-lg font-bold text-slate-800">Delete Trip</h3><p className="text-sm text-slate-500 mt-1">You are about to delete trip <span className="font-semibold text-slate-700">{tripToDelete?.tripNo}</span>. Provide a reason.</p></div>
              <button onClick={cancelDelete} className="h-8 w-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400"><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg></button>
            </div>
            <div className="mt-4">
              <label htmlFor="deleteReason" className="block text-sm font-medium text-slate-700">Reason <span className="text-rose-500">*</span></label>
              <textarea id="deleteReason" rows={3} value={deleteReason} onChange={(e) => setDeleteReason(e.target.value)} placeholder="Why is this trip being deleted?" className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2 text-sm text-slate-700 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 outline-none" />
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={cancelDelete} className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-all">Cancel</button>
              <button onClick={confirmDelete} className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-sm font-medium text-white transition-all shadow-sm active:scale-95">Confirm Delete</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default React.memo(TripRecentTable);