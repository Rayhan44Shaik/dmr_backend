// src/modules/masters/employees/pages/EmployeesPage.tsx
import React, { useState, useMemo } from "react";
import DashboardLayout from "../../../../layouts/DashboardLayout/DashboardLayout";
import PageLayout from "../../../../components/common/PageLayout";
import EmployeeTable from "../components/EmployeeTable";
import EmployeeDialog from "../dialogs/EmployeeDialog";
import { useEmployees } from "../hooks/useEmployees";
import { useSafeNotification } from "../../../../hooks/useSafeNotification";
import { exportToPDF, exportToExcel } from "../../../../utils/exportUtils";
import { logAuditEvent } from "../../../../utils/securityUtils";
import { handleApiError } from "../services/employeeService";
import type { Employee } from "../types/employee";
import {
  paginationBarClass,
  paginationNavBtnClass,
  paginationPageBtnClass,
  shouldShowPagination,
} from "../../../../shared/ui/paginationStyles";
import BulkImportDialog from "../../components/bulk-import/BulkImportDialog";
import { buildEmployeeBulkImportConfig } from "../bulkImportConfig";

type EmployeesPageProps = { embedded?: boolean };

const ITEMS_PER_PAGE = 10;

function EmployeesPage({ embedded = false }: EmployeesPageProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedDepartment, setSelectedDepartment] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const { showNotification } = useSafeNotification();
  const {
    employees,
    loading,
    saving,
    error,
    reload,
    addEmployee,
    addEmployeesBulk,
    editEmployee,
    removeEmployee,
  } = useEmployees();

  const employeeBulkImportConfig = useMemo(
    () => buildEmployeeBulkImportConfig({ addEmployeesBulk, reload }),
    [addEmployeesBulk, reload]
  );

  // Get unique departments for filter dropdown
  const departments = useMemo(() => {
    const depts = new Set(employees.map((emp) => emp.department));
    return Array.from(depts).sort();
  }, [employees]);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setCurrentPage(1);
  };

  const handleDepartmentChange = (value: string) => {
    setSelectedDepartment(value);
    setCurrentPage(1);
  };

  const filteredEmployees = useMemo(() => {
    const keyword = search.toLowerCase();
    return employees.filter((emp) => {
      const matchesSearch =
        emp.employeeName.toLowerCase().includes(keyword) ||
        emp.department.toLowerCase().includes(keyword) ||
        (emp.role && emp.role.toLowerCase().includes(keyword)) ||
        emp.phoneNumber.includes(keyword) ||
        emp.email.toLowerCase().includes(keyword);

      const matchesDepartment =
        selectedDepartment === "" || emp.department === selectedDepartment;

      return matchesSearch && matchesDepartment;
    });
  }, [employees, search, selectedDepartment]);

  const totalPages = Math.ceil(filteredEmployees.length / ITEMS_PER_PAGE) || 1;
  const paginatedEmployees = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredEmployees.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredEmployees, currentPage]);

  const handleExportPDF = () => {
    if (filteredEmployees.length === 0) {
      showNotification("No data to export.", "error");
      return;
    }
    const headers = ["Emp No", "Employee Name", "Department", "Role", "Phone", "Salary", "Status"];
    const rows = filteredEmployees.map((emp) => [
      emp.employeeNo.toString(),
      emp.employeeName,
      emp.department,
      emp.role,
      emp.phoneNumber,
      emp.salary?.toString() || "0",
      emp.status,
    ]);
    const filename = `Employees_${new Date().toISOString().split("T")[0]}`;
    exportToPDF("Employees - Master List", headers, rows, filename);
    logAuditEvent("EXPORT_PDF", "Employees", undefined, { count: filteredEmployees.length });
    showNotification("PDF exported successfully!", "success");
  };

  const handleExportExcel = () => {
    if (filteredEmployees.length === 0) {
      showNotification("No data to export.", "error");
      return;
    }
    const headers = ["Emp No", "Employee Name", "Department", "Role", "Phone", "Salary", "Status"];
    const rows = filteredEmployees.map((emp) => [
      emp.employeeNo.toString(),
      emp.employeeName,
      emp.department,
      emp.role,
      emp.phoneNumber,
      emp.salary?.toString() || "0",
      emp.status,
    ]);
    const filename = `Employees_${new Date().toISOString().split("T")[0]}`;
    exportToExcel("Employees - Master List", headers, rows, filename);
    logAuditEvent("EXPORT_EXCEL", "Employees", undefined, { count: filteredEmployees.length });
    showNotification("Excel exported successfully!", "success");
  };

  const validateEmployee = (employee: Partial<Employee>): string | null => {
    const name = employee.employeeName?.trim() ?? "";
    const department = employee.department?.trim() ?? "";
    const phone = employee.phoneNumber?.trim() ?? "";
    const email = employee.email?.trim() ?? "";
    const salary = Number(employee.salary);

    if (!name || !department || !phone || employee.salary === undefined || employee.salary === null) {
      return "Please fill all required fields (marked with *).";
    }
    if (!/^[0-9]{10}$/.test(phone)) {
      return "Mobile Number must be exactly 10 digits.";
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return "Please enter a valid email address.";
    }
    if (Number.isNaN(salary) || salary < 0) {
      return "Salary must be a positive number.";
    }
    if (
      (department === "Driver" || department === "Collection") &&
      !employee.licenseNumber?.trim()
    ) {
      return "License Number is required for Driver and Collection departments.";
    }
    if (employee.aadharNumber && !/^[0-9]{12}$/.test(employee.aadharNumber.replace(/\s/g, ""))) {
      return "Aadhar Number must be exactly 12 digits.";
    }

    const duplicateName = employees.some(
      (e) =>
        e.department === department &&
        e.employeeName.trim().toLowerCase() === name.toLowerCase() &&
        e.id !== editingEmployee?.id
    );
    if (duplicateName) {
      return `An employee with the name "${name}" already exists in the ${department} department.`;
    }

    const duplicatePhone = employees.some(
      (e) => e.phoneNumber === phone && e.id !== editingEmployee?.id
    );
    if (duplicatePhone) {
      return "Phone Number already exists.";
    }

    if (email) {
      const duplicateEmail = employees.some(
        (e) =>
          e.email.trim().toLowerCase() === email.toLowerCase() &&
          e.id !== editingEmployee?.id
      );
      if (duplicateEmail) {
        return "Email already exists.";
      }
    }

    return null;
  };

  const handleSaveEmployee = async (employee: Partial<Employee>): Promise<boolean> => {
    const validationError = validateEmployee(employee);
    if (validationError) {
      showNotification(validationError, "error");
      return false;
    }

    const payload = {
      employeeName: employee.employeeName!.trim(),
      department: employee.department!,
      role: employee.role?.trim() ?? "",
      phoneNumber: employee.phoneNumber!.trim(),
      email: employee.email?.trim() ?? "",
      address: employee.address?.trim() ?? "",
      joiningDate: employee.joiningDate ?? "",
      aadharNumber: employee.aadharNumber?.replace(/\s/g, "") || undefined,
      licenseNumber: employee.licenseNumber?.trim() || undefined,
      salary: Number(employee.salary),
      status: (employee.status === "Inactive" ? "Inactive" : "Active") as
        | "Active"
        | "Inactive",
    };

    try {
      if (editingEmployee) {
        // PUT must send the complete employee object, including id + employeeNo.
        await editEmployee(editingEmployee.id, {
          ...payload,
          id: editingEmployee.id,
          employeeNo: editingEmployee.employeeNo,
        });
        logAuditEvent("UPDATE_EMPLOYEE", "Employees", editingEmployee.id);
        showNotification("Employee updated successfully!", "success");
      } else {
        const created = await addEmployee(payload);
        const newId = created.find(
          (e) =>
            e.employeeName === payload.employeeName &&
            e.phoneNumber === payload.phoneNumber
        )?.id;
        logAuditEvent("CREATE_EMPLOYEE", "Employees", newId);
        showNotification("Employee added successfully!", "success");
      }
      setEditingEmployee(null);
      setShowDialog(false);
      return true;
    } catch (err) {
      showNotification(handleApiError(err), "error");
      return false;
    }
  };

  const handleEditEmployee = (employee: Employee) => {
    setEditingEmployee(employee);
    setShowDialog(true);
  };

  const handleDeleteEmployee = async (id: number) => {
    setDeletingId(id);
    try {
      await removeEmployee(id);
      logAuditEvent("DELETE_EMPLOYEE", "Employees", id);
      showNotification("Employee deleted successfully!", "success");
    } catch (err) {
      showNotification(handleApiError(err), "error");
    } finally {
      setDeletingId(null);
    }
  };

  const content = (
    <div className="w-full space-y-2 employee-page-container">
      <style>{`
        .employee-page-container button,
        [role="dialog"] button {
          transition: all 0.15s ease-in-out;
        }
        .employee-page-container button:hover,
        [role="dialog"] button:hover {
          transform: translateY(-1px);
        }
      `}</style>

      {/* Main Container - Removed overflow-hidden so dropdowns overlay properly */}
      <div className="w-full bg-white rounded-xl border border-slate-200/90 shadow-sm">
        {/* Toolbar */}
        <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/40 rounded-t-xl">
          <div className="flex flex-wrap items-center justify-between gap-4">
            {/* Search + Department Filter */}
            <div className="flex flex-1 flex-wrap items-center gap-3">
              <div className="flex-1 min-w-[200px] max-w-md">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search Employee..."
                    value={search}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    className="w-full pl-9 pr-4 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    disabled={loading}
                  />
                  <svg
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
              </div>

              {/* Department Filter */}
              <div className="flex items-center gap-2 min-w-[160px]">
                <span className="text-sm font-medium text-slate-600 whitespace-nowrap">Department:</span>
                <select
                  value={selectedDepartment}
                  onChange={(e) => handleDepartmentChange(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  disabled={loading}
                >
                  <option value="">All</option>
                  {departments.map((dept) => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Action Buttons - Right Side */}
            <div className="flex items-center gap-3 flex-shrink-0">
              
              {/* 1. Export Dropdown (Soft Light Emerald Fill) */}
              <div className="relative group z-50">
                <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 hover:border-emerald-300 transition-all shadow-sm">
                  <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  Export
                  <svg className="w-4 h-4 text-emerald-500 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {/* Dropdown Menu */}
                <div className="absolute right-0 mt-2 w-32 bg-white border border-slate-200 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 transform translate-y-2 group-hover:translate-y-0 overflow-hidden">
                  <button
                    onClick={handleExportPDF}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                      <path fillRule="evenodd" d="M8 11a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1zm0 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1zm0 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" clipRule="evenodd" />
                    </svg>
                    PDF
                  </button>
                  <button
                    onClick={handleExportExcel}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-green-600 hover:bg-green-50 transition-colors border-t border-slate-100"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M2 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1H3a1 1 0 01-1-1V4zm6 0a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1H9a1 1 0 01-1-1V4zm6 0a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
                    </svg>
                    Excel
                  </button>
                </div>
              </div>

              {/* 2. Import Button (Soft Light Indigo Fill) */}
              <button
                onClick={() => setShowBulkImport(true)}
                disabled={loading || saving}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 hover:border-indigo-300 transition-all shadow-sm disabled:opacity-50 z-40"
              >
                <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                Import
              </button>

              {/* 3. Add Employee Button (Solid Blue Fill) */}
              <button
                onClick={() => {
                  setEditingEmployee(null);
                  setShowDialog(true);
                }}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-lg hover:bg-blue-700 transition-all shadow-sm disabled:opacity-50 z-10"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Employee
              </button>
            </div>
          </div>
        </div>

        {/* Status Counter */}
        <div className="px-4 py-2 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-600 uppercase tracking-wider">Employees Directory</span>
            <span className="px-2 py-0.5 font-semibold text-blue-700 bg-blue-50 border border-blue-200/60 rounded-full">
              {filteredEmployees.length} records
            </span>
            {(loading || saving || deletingId !== null) && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 font-medium text-slate-600 bg-slate-100 border border-slate-200 rounded-full">
                <svg className="animate-spin h-3 w-3 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                {loading ? "Loading..." : "Saving..."}
              </span>
            )}
          </div>
          <p className="text-slate-500 font-medium">
            Showing {paginatedEmployees.length} of {filteredEmployees.length} Employees (Page {currentPage} of {totalPages})
          </p>
        </div>

        {error && !loading && (
          <div className="mx-4 mt-3 px-3 py-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between gap-3">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => {
                void reload().catch(() => undefined);
              }}
              className="shrink-0 text-xs font-semibold text-red-700 underline"
            >
              Retry
            </button>
          </div>
        )}

        {/* Table */}
        <div className="p-0 relative min-h-[120px]">
          {loading && employees.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500 gap-3">
              <svg className="animate-spin h-8 w-8 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <p className="text-sm font-medium">Loading employees...</p>
            </div>
          ) : !loading && employees.length === 0 && !error ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-500 gap-2">
              <p className="text-sm font-medium text-slate-700">No employees found.</p>
              <p className="text-xs text-slate-500">Add an employee to get started.</p>
            </div>
          ) : (
            <EmployeeTable
              employees={paginatedEmployees}
              onEdit={handleEditEmployee}
              onDelete={handleDeleteEmployee}
            />
          )}
        </div>

        {shouldShowPagination(filteredEmployees.length) && (
        <div className={paginationBarClass}>
          <button
            onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
            disabled={currentPage === 1 || loading}
            className={paginationNavBtnClass}
          >
            Previous
          </button>
          <div className="flex items-center gap-1.5">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
              <button
                key={pageNum}
                onClick={() => setCurrentPage(pageNum)}
                disabled={loading}
                className={paginationPageBtnClass(currentPage === pageNum)}
              >
                {pageNum}
              </button>
            ))}
          </div>
          <button
            onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
            disabled={currentPage === totalPages || loading}
            className={paginationNavBtnClass}
          >
            Next
          </button>
        </div>
        )}
      </div>

      <EmployeeDialog
        open={showDialog}
        onClose={() => {
          setEditingEmployee(null);
          setShowDialog(false);
        }}
        onSave={handleSaveEmployee}
        employee={editingEmployee}
      />
      <BulkImportDialog
        open={showBulkImport}
        onClose={() => setShowBulkImport(false)}
        config={employeeBulkImportConfig}
        existing={employees}
        onImported={(result) => {
          logAuditEvent("BULK_IMPORT", "Employees", undefined, {
            count: result.imported,
          });
          showNotification(
            `Imported ${result.imported} of ${result.total} employees.`,
            result.failed === 0 ? "success" : "error"
          );
        }}
      />
    </div>
  );

  if (embedded) {
    return content;
  }

  return (
    <DashboardLayout>
      <PageLayout className="!py-2 px-8 sm:px-12 lg:px-16 max-w-6xl mx-auto">
        {content}
      </PageLayout>
    </DashboardLayout>
  );
}

export default React.memo(EmployeesPage);