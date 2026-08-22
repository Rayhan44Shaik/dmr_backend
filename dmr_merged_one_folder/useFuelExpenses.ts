import { useCallback, useEffect, useState } from "react";
import { fuelExpenseService, type FuelListMeta } from "../services/fuelExpenseService";
import type { FuelExpense, FuelExpenseDraft } from "../types/fuelExpense";

type NotificationFn = (msg: string, type?: "success" | "error" | "info") => void;

export function useFuelExpenses(showNotification?: NotificationFn) {
  const [expenses, setExpenses] = useState<FuelExpense[]>([]);
  const [meta, setMeta] = useState<FuelListMeta>({ total: 0, page: 1, limit: 10, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedVehicles, setSelectedVehicles] = useState<string[]>([]);
  const [sourceType, setSourceType] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [tripNo, setTripNo] = useState("");
  const [billNo, setBillNo] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fuelExpenseService.list({
        page: currentPage,
        limit: pageSize,
        fromDate,
        toDate,
        vehicleNo: selectedVehicles[0] || "",
        sourceType,
        status: statusFilter,
        tripNo,
        billNo,
      });
      setExpenses(result.data);
      setMeta(result.meta);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load fuel expenses.";
      setError(message);
      showNotification?.(message, "error");
    } finally {
      setLoading(false);
    }
  }, [
    currentPage,
    fromDate,
    toDate,
    selectedVehicles,
    sourceType,
    statusFilter,
    tripNo,
    billNo,
    showNotification,
  ]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filteredSummary = {
    totalLitres: expenses.reduce((sum, e) => sum + e.litres, 0),
    totalAmount: expenses.reduce((sum, e) => sum + e.amount, 0),
    pendingCount: expenses.filter((e) => e.status === "Pending").length,
    approvedCount: expenses.filter((e) => e.status === "Approved").length,
    avgMileage: null as number | null,
    recentTripMileage: null as number | null,
  };

  const saveExpense = async (expense: FuelExpenseDraft) => {
    setIsSaving(true);
    try {
      await fuelExpenseService.save(expense);
      showNotification?.("Fuel bill saved successfully!", "success");
      await refresh();
      return true;
    } catch (err) {
      showNotification?.(err instanceof Error ? err.message : "Failed to save fuel bill.", "error");
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const updateExpense = async (id: string, updates: Partial<FuelExpense>) => {
    setIsSaving(true);
    try {
      await fuelExpenseService.update(id, updates);
      showNotification?.("Fuel bill updated successfully!", "success");
      await refresh();
      return true;
    } catch (err) {
      showNotification?.(err instanceof Error ? err.message : "Failed to update fuel bill.", "error");
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const deleteExpense = async (id: string) => {
    setIsSaving(true);
    try {
      await fuelExpenseService.remove(id);
      showNotification?.("Fuel bill deleted successfully!", "success");
      await refresh();
      return true;
    } catch (err) {
      showNotification?.(err instanceof Error ? err.message : "Failed to delete fuel bill.", "error");
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const approveExpense = async (id: string) => {
    setIsSaving(true);
    try {
      await fuelExpenseService.approve(id);
      showNotification?.("Fuel bill approved successfully!", "success");
      await refresh();
      return true;
    } catch (err) {
      showNotification?.(err instanceof Error ? err.message : "Failed to approve fuel bill.", "error");
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const rejectExpense = async (id: string, reason: string) => {
    setIsSaving(true);
    try {
      await fuelExpenseService.reject(id, reason);
      showNotification?.("Fuel bill rejected.", "success");
      await refresh();
      return true;
    } catch (err) {
      showNotification?.(err instanceof Error ? err.message : "Failed to reject fuel bill.", "error");
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const resetFilters = () => {
    setFromDate("");
    setToDate("");
    setSelectedVehicles([]);
    setSourceType("");
    setStatusFilter("");
    setTripNo("");
    setBillNo("");
    setCurrentPage(1);
  };

  return {
    expenses,
    filteredData: expenses,
    paginatedData: expenses,
    currentPage,
    setCurrentPage,
    totalPages: meta.totalPages,
    totalCount: meta.total,
    fromDate,
    setFromDate,
    toDate,
    setToDate,
    selectedVehicles,
    setSelectedVehicles,
    sourceType,
    setSourceType,
    statusFilter,
    setStatusFilter,
    tripNo,
    setTripNo,
    billNo,
    setBillNo,
    resetFilters,
    refresh,
    loading,
    isSaving,
    error,
    filteredSummary,
    saveExpense,
    updateExpense,
    deleteExpense,
    approveExpense,
    rejectExpense,
  };
}
