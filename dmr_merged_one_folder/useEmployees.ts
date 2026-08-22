import { useCallback, useEffect, useState } from "react";

import type { Employee } from "../types/employee";
import {
  bulkCreateEmployees,
  createEmployee,
  deleteEmployee,
  handleApiError,
  loadEmployees,
  refreshEmployees,
  updateEmployee,
  type EmployeeInput,
} from "../services/employeeService";

/**
 * Employees page data hook — table state comes only from GET /api/masters/employees.
 */
export function useEmployees() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Sole population path for the Employees table
      const data = await loadEmployees();
      setEmployees(data);
      return data;
    } catch (err) {
      const message = handleApiError(err);
      setError(message);
      setEmployees([]);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload().catch(() => {
      /* error already captured in state */
    });
  }, [reload]);

  const addEmployee = useCallback(async (input: EmployeeInput) => {
    setSaving(true);
    setError(null);
    try {
      await createEmployee(input);
      const data = await refreshEmployees();
      setEmployees(data);
      return data;
    } catch (err) {
      const message = handleApiError(err);
      setError(message);
      throw err;
    } finally {
      setSaving(false);
    }
  }, []);

  // Uses the real transactional POST /api/masters/employees/bulk endpoint.
  // If ANY row is invalid/duplicate the backend rejects the whole batch (400/409).
  const addEmployeesBulk = useCallback(async (inputs: EmployeeInput[]) => {
    setSaving(true);
    setError(null);
    try {
      await bulkCreateEmployees(inputs);
      const data = await refreshEmployees();
      setEmployees(data);
      return data;
    } catch (err) {
      const message = handleApiError(err);
      setError(message);
      throw err;
    } finally {
      setSaving(false);
    }
  }, []);

  const editEmployee = useCallback(async (id: number, input: EmployeeInput) => {
    setSaving(true);
    setError(null);
    try {
      await updateEmployee(id, input);
      const data = await refreshEmployees();
      setEmployees(data);
      return data;
    } catch (err) {
      const message = handleApiError(err);
      setError(message);
      throw err;
    } finally {
      setSaving(false);
    }
  }, []);

  const removeEmployee = useCallback(async (id: number) => {
    setSaving(true);
    setError(null);
    try {
      await deleteEmployee(id);
      const data = await refreshEmployees();
      setEmployees(data);
      return data;
    } catch (err) {
      const message = handleApiError(err);
      setError(message);
      throw err;
    } finally {
      setSaving(false);
    }
  }, []);

  return {
    employees,
    loading,
    saving,
    error,
    reload,
    addEmployee,
    addEmployeesBulk,
    editEmployee,
    removeEmployee,
  };
}
