// src/modules/staff/components/duty-planner/DutyPlannerFilters.tsx

import { memo, useState, useRef, useEffect } from 'react';
import { ChevronDown, RotateCcw, Filter, X, Search } from 'lucide-react';

interface DutyPlannerFiltersProps {
  role: string[];
  roles: string[];
  searchQuery?: string;
  onSearchChange?: (val: string) => void;
  onRoleChange: (val: string[]) => void;
  onReset: () => void;
}

function DutyPlannerFilters({
  role,
  roles,
  searchQuery = '',
  onSearchChange,
  onRoleChange,
  onReset,
}: DutyPlannerFiltersProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchValue, setSearchValue] = useState(searchQuery || '');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sync searchValue with searchQuery prop
  useEffect(() => {
    setSearchValue(searchQuery || '');
  }, [searchQuery]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleRole = (roleValue: string) => {
    if (role.includes(roleValue)) {
      onRoleChange(role.filter(r => r !== roleValue));
    } else {
      onRoleChange([...role, roleValue]);
    }
  };

  const removeRole = (roleValue: string) => {
    onRoleChange(role.filter(r => r !== roleValue));
  };

  const handleSearchInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchValue(val);
    if (onSearchChange) {
      onSearchChange(val);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-1 w-full">
          {/* Role Filter */}
          <div className="relative flex items-center gap-2" ref={dropdownRef}>
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider hidden sm:block">Role</label>
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="h-10 px-4 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 focus:ring-2 focus:ring-green-200 outline-none bg-white flex items-center gap-2 hover:bg-slate-50 transition shadow-sm min-w-[160px] justify-between"
            >
              <span className="flex items-center gap-1.5">
                <Filter size={16} className="text-slate-400" />
                {role.length === 0 ? 'All Roles' : `${role.length} selected`}
              </span>
              <ChevronDown size={16} className="text-slate-400" />
            </button>

            {isDropdownOpen && (
              <div className="absolute top-[calc(100%+8px)] left-0 w-56 bg-white border border-slate-200 rounded-lg shadow-xl z-20 max-h-60 overflow-auto">
                <div className="p-1.5">
                  {roles.map((r) => (
                    <label key={r} className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 rounded-md cursor-pointer transition">
                      <input
                        type="checkbox"
                        checked={role.includes(r)}
                        onChange={() => toggleRole(r)}
                        className="rounded border-slate-300 text-green-600 focus:ring-green-500 h-4 w-4"
                      />
                      <span className="text-sm text-slate-700">{r}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Selected Role Chips */}
          {role.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {role.map((r) => (
                <span
                  key={r}
                  className="inline-flex items-center gap-1.5 pl-3 pr-2 py-1 bg-green-50 border border-green-200 text-green-700 text-sm font-medium rounded-full"
                >
                  {r}
                  <button
                    onClick={() => removeRole(r)}
                    className="hover:bg-green-200 hover:text-green-900 rounded-full p-0.5 transition focus:outline-none"
                  >
                    <X size={14} />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Search */}
          <div className="relative flex-1 max-w-sm sm:max-w-xs">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search employee name..."
              value={searchValue}
              onChange={handleSearchInput}
              className="h-10 w-full pl-10 pr-4 rounded-lg border border-slate-200 text-sm focus:border-green-500 focus:ring-2 focus:ring-green-200 outline-none transition bg-white shadow-sm"
            />
          </div>

          {/* Reset */}
          <button
            onClick={() => {
              setSearchValue('');
              onReset();
            }}
            className="h-10 px-4 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition flex items-center gap-2 bg-white shadow-sm"
          >
            <RotateCcw size={16} />
            <span className="hidden sm:inline">Reset</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default memo(DutyPlannerFilters);