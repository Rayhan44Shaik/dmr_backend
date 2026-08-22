// src/modules/staff/pages/DutyPlannerPage.tsx

import { useState, useCallback, useMemo } from 'react';
import { useDutyPlanner, isDateLocked } from '../hooks/useDutyPlanner';
import { useSafeNotification } from '../../../hooks/useSafeNotification';
import DutyPlannerFilters from '../components/duty-planner/DutyPlannerFilters';
import DutyPlannerGrid from '../components/duty-planner/DutyPlannerGrid';
import ShiftPicker from '../components/duty-planner/ShiftPicker';
import { CheckCircle2, Sparkles, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';
import type { DutyPlannerFilters as DutyPlannerFiltersType, DutyAssignment, Employee } from '../types/staffDashboard';
import type { AutoPlan } from '../services/dutyPlannerService';

function DutyPlannerPage() {
  const { showNotification } = useSafeNotification();

  const {
    employees,
    weekDays,
    loading,
    saving,
    filters,
    setFilters,
    getAssignment,
    updateAssignment,
    deleteAssignment,
    moveWeek,
    resetFilters,
    selectedCell,
    setSelectedCell,
    showPicker,
    setShowPicker,
    allRoles,
    weekStart,
    weekStatus,
    canEditWeek,
    saturday,
    validation,
    autoAssignAll,
    submitCurrentWeek,
  } = useDutyPlanner(showNotification);

  const [searchQuery, setSearchQuery] = useState('');
  const [lastAutoPlan, setLastAutoPlan] = useState<AutoPlan | null>(null);

  const handleCellClick = useCallback((employeeId: number, date: string) => {
    if (isDateLocked(date)) {
      showNotification('Cannot edit duties for previous completed weeks.', 'error');
      return;
    }
    if (!canEditWeek) {
      showNotification(`This week is ${weekStatus.toLowerCase()} and cannot be modified.`, 'error');
      return;
    }
    setSelectedCell({ employeeId, date });
    setShowPicker(true);
  }, [canEditWeek, weekStatus, setSelectedCell, setShowPicker, showNotification]);

  const handleSelectShift = useCallback((dutyType: string) => {
    if (!selectedCell) return;
    void updateAssignment(selectedCell.employeeId, selectedCell.date, dutyType as DutyAssignment['dutyType']).then((success) => {
      if (success) {
        setShowPicker(false);
        setSelectedCell(null);
      }
    });
  }, [selectedCell, updateAssignment, setSelectedCell, setShowPicker]);

  const handleRemoveDuty = useCallback(() => {
    if (!selectedCell) return;
    void deleteAssignment(selectedCell.employeeId, selectedCell.date).then((success) => {
      if (success) {
        setShowPicker(false);
        setSelectedCell(null);
      }
    });
  }, [selectedCell, deleteAssignment, setSelectedCell, setShowPicker]);

  const handleAutoAssign = useCallback(() => {
    void autoAssignAll().then((res) => {
      if (res.plan) setLastAutoPlan(res.plan);
      if (res.ok) setLastAutoPlan(res.plan ?? null);
    });
  }, [autoAssignAll]);

  const handleSubmitWeek = useCallback(() => {
    void submitCurrentWeek();
  }, [submitCurrentWeek]);

  const handleClosePicker = useCallback(() => {
    setShowPicker(false);
    setSelectedCell(null);
  }, [setShowPicker, setSelectedCell]);

  const handleReset = useCallback(() => {
    resetFilters();
    setSearchQuery('');
  }, [resetFilters]);

  const filteredEmployees = useMemo(() => {
    if (!searchQuery.trim()) return employees;
    const lowerQuery = searchQuery.toLowerCase();
    return employees.filter((emp: Employee) =>
      (emp.employeeName || '').toLowerCase().includes(lowerQuery)
    );
  }, [employees, searchQuery]);

  const selectedEmployee = useMemo(() => {
    if (!selectedCell) return null;
    return employees.find((e) => String(e.id) === String(selectedCell.employeeId)) || null;
  }, [selectedCell, employees]);

  const statusLabel =
    weekStatus === 'Closed'
      ? 'Closed'
      : weekStatus === 'Locked'
        ? 'Locked'
        : weekStatus === 'Submitted'
          ? 'Submitted'
          : weekStatus || 'Open';

  const statusClasses =
    weekStatus === 'Closed'
      ? 'bg-slate-100 text-slate-600 border-slate-200'
      : weekStatus === 'Locked'
        ? 'bg-slate-100 text-slate-600 border-slate-200'
        : weekStatus === 'Submitted'
          ? 'bg-blue-50 text-blue-700 border-blue-200'
          : 'bg-emerald-50 text-emerald-700 border-emerald-200';

  const formatWeekRange = (start: string) => {
    if (!start) return '';
    const startDate = new Date(start);
    const endDate = new Date(start);
    endDate.setDate(endDate.getDate() + 6);
    return `${startDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} – ${endDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`;
  };

  return (
    <div className="w-full space-y-4 bg-slate-50/30 min-h-screen pb-8">
      {/* Weekly Toolbar - Single compact control */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => moveWeek(-1)}
            className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition"
            title="Previous Week"
            aria-label="Previous week"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={() => resetFilters()}
            className="h-9 px-3 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 text-xs font-semibold hover:bg-blue-100 transition"
            title="Current Week"
          >
            Current Week
          </button>
          <button
            onClick={() => moveWeek(1)}
            className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition"
            title="Next Week"
            aria-label="Next week"
          >
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-sm font-semibold text-slate-800 whitespace-nowrap">
            Week: {formatWeekRange(weekStart)}
          </span>
          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${statusClasses}`}>
            {statusLabel}
          </span>
          {!canEditWeek && weekStatus !== 'Open' && (
            <span className="text-xs text-slate-400 hidden sm:inline">read-only</span>
          )}
        </div>
      </div>

      {/* Filter Bar - Clean and compact */}
      <DutyPlannerFilters
        role={filters.role}
        roles={allRoles}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onRoleChange={(val) =>
          setFilters((f: DutyPlannerFiltersType) => ({ ...f, role: val }))
        }
        onReset={handleReset}
      />

      {/* Duty Calendar - Main focus */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-sm overflow-hidden">
        <DutyPlannerGrid
          employees={filteredEmployees}
          weekDays={weekDays}
          getAssignment={getAssignment}
          onCellClick={handleCellClick}
          loading={loading}
          weekLocked={!canEditWeek}
        />
      </div>

      {/* Week Actions - Compact row */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={handleAutoAssign}
            disabled={!canEditWeek || loading || saving}
            className="h-10 px-4 rounded-lg border border-orange-200 bg-orange-50 text-orange-700 text-sm font-medium hover:bg-orange-100 transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Sparkles size={15} />
            Auto Assign
          </button>
          <button
            onClick={handleSubmitWeek}
            disabled={!canEditWeek || loading || saving}
            className="h-10 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition flex items-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <CheckCircle2 size={15} />
            Submit Week
          </button>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          {validation.ok ? (
            <span className="flex items-center gap-1.5 text-emerald-600">
              <CheckCircle2 size={12} />
              All checks passed
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-rose-600">
              <AlertCircle size={12} />
              {validation.problems.length} issue(s)
            </span>
          )}
          {saturday.shortage > 0 && (
            <span className="flex items-center gap-1.5 text-rose-600 ml-2 border-l border-slate-200 pl-2">
              <AlertCircle size={12} />
              Saturday {saturday.shortage} short
            </span>
          )}
        </div>
      </div>

      {/* Auto Assign Preview / Conflicts / Validation - Collapsible, only when relevant */}
      {(lastAutoPlan || !validation.ok || saturday.shortage > 0) && (
        <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-sm space-y-3">
          {lastAutoPlan && (
            <div className="bg-slate-50/60 border border-slate-200 rounded-lg p-3">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Auto Assign Preview</div>
              <div className="text-sm text-slate-700">
                {lastAutoPlan.employeesAffected} employee(s) · Delivery {lastAutoPlan.delivery} · Repair {lastAutoPlan.repair} · Office {lastAutoPlan.office} · Collection {lastAutoPlan.collection}
              </div>
              {lastAutoPlan.conflicts.length > 0 && (
                <ul className="mt-2 list-disc list-inside space-y-0.5 text-xs text-rose-600">
                  {lastAutoPlan.conflicts.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {saturday.shortage > 0 && (
            <div className="bg-rose-50/80 border border-rose-200/80 rounded-lg p-2.5 text-xs text-rose-700 flex items-start gap-2">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              <span>
                Saturday requires <strong>{saturday.shortage} more</strong> assigned employee(s). Week cannot be submitted until resolved.
              </span>
            </div>
          )}

          {!validation.ok && validation.problems.length > 0 && (
            <div className="bg-rose-50/80 border border-rose-200/80 rounded-lg p-2.5 text-xs text-rose-700">
              <strong className="font-semibold">Validation issues:</strong>
              <ul className="mt-1 list-disc list-inside space-y-0.5">
                {validation.problems.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Shift Picker Modal */}
      {selectedCell && (
        <ShiftPicker
          isOpen={showPicker}
          onClose={handleClosePicker}
          onSelect={handleSelectShift}
          onRemove={getAssignment(selectedCell.employeeId, selectedCell.date)?.id ? handleRemoveDuty : undefined}
          currentDuty={getAssignment(selectedCell.employeeId, selectedCell.date)?.dutyType}
          date={selectedCell.date}
          employeeName={selectedEmployee ? selectedEmployee.employeeName : ''}
          employeeRole={selectedEmployee ? selectedEmployee.role : ''}
        />
      )}
    </div>
  );
}

export default DutyPlannerPage;