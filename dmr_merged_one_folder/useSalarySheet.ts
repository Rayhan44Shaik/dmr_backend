// src/modules/staff/hooks/useSalarySheet.ts

import { useState, useEffect, useCallback } from 'react';
import { loadEmployees, loadSalaryRecords, saveSalaryRecords } from '../services/staffService';
import type { SalaryRecord } from '../types/staffDashboard';

export function useSalarySheet(employeeId: number | null, month: string) {
  const [employee, setEmployee] = useState<any>(null);
  const [salary, setSalary] = useState<SalaryRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);

  const loadData = useCallback(() => {
    setLoading(true);
    try {
      const employees = loadEmployees();
      const emp = employees.find((e) => e.id === employeeId);
      setEmployee(emp || null);

      const records = loadSalaryRecords();
      const existing = records.find(
        (r) => r.employeeId === employeeId && r.month === month
      );
      setSalary(existing || null);
    } catch (error) {
      console.error('Failed to load salary data:', error);
    } finally {
      setLoading(false);
    }
  }, [employeeId, month]);

  useEffect(() => {
    if (employeeId) {
      loadData();
    }
  }, [loadData, employeeId, month]);

  const calculateNetSalary = useCallback(
    (data: {
      basicSalary: number;
      overtime: number;
      incentives: number;
      fuelAllowance: number;
      nightAllowance: number;
      leaveDeduction: number;
      advanceRecovery: number;
      loanEMI: number;
      latePenalty: number;
      otherDeductions: number;
    }) => {
      const gross =
        data.basicSalary +
        data.overtime +
        data.incentives +
        data.fuelAllowance +
        data.nightAllowance;
      const deductions =
        data.leaveDeduction +
        data.advanceRecovery +
        data.loanEMI +
        data.latePenalty +
        data.otherDeductions;
      return { gross, deductions, net: gross - deductions };
    },
    []
  );

  const saveSalary = useCallback(
    (data: Omit<SalaryRecord, 'id' | 'createdAt' | 'totalGross' | 'totalDeductions' | 'netSalary'>) => {
      const { gross, deductions, net } = calculateNetSalary(data);
      const newRecord: SalaryRecord = {
        ...data,
        id: salary?.id || Date.now().toString(),
        totalGross: gross,
        totalDeductions: deductions,
        netSalary: net,
        createdAt: salary?.createdAt || new Date().toISOString(),
      };

      const records = loadSalaryRecords();
      let updated: SalaryRecord[];
      if (salary) {
        updated = records.map((r) => (r.id === salary.id ? newRecord : r));
      } else {
        updated = [...records, newRecord];
      }
      saveSalaryRecords(updated);
      setSalary(newRecord);
      setIsEditing(false);
      return newRecord;
    },
    [salary, calculateNetSalary]
  );

  const updateStatus = useCallback(
    (status: 'Pending' | 'Paid', paymentDate?: string) => {
      if (!salary) return;
      const records = loadSalaryRecords();
      const updated = records.map((r) =>
        r.id === salary.id
          ? { ...r, status, paymentDate: paymentDate || (status === 'Paid' ? new Date().toISOString().split('T')[0] : undefined) }
          : r
      );
      saveSalaryRecords(updated);
      setSalary({ ...salary, status, paymentDate });
    },
    [salary]
  );

  const refresh = useCallback(() => {
    loadData();
  }, [loadData]);

  return {
    employee,
    salary,
    loading,
    isEditing,
    setIsEditing,
    calculateNetSalary,
    saveSalary,
    updateStatus,
    refresh,
  };
}