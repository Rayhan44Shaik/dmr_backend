import React, { useState, useMemo, useRef, useEffect } from "react";
import { Box, ChevronDown, Search } from "lucide-react";
import type { BoxDetail } from "../../types/trip";

interface BoxSelectorProps {
  boxes: BoxDetail[];
  selectedIds: number[];
  onSelectionChange: (ids: number[]) => void;
  disabled?: boolean;
  usedBoxIds?: number[];
}

export default function BoxSelector({
  boxes,
  selectedIds,
  onSelectionChange,
  disabled = false,
  usedBoxIds = [],
}: BoxSelectorProps) {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const containerRef = useRef<HTMLDivElement>(null);

  const availableBoxes = useMemo<BoxDetail[]>(() => {
    return boxes.filter(
      (b: BoxDetail) => !usedBoxIds.includes(b.boxNo) || selectedIds.includes(b.boxNo)
    );
  }, [boxes, usedBoxIds, selectedIds]);

  const filteredBoxes = useMemo<BoxDetail[]>(() => {
    if (!searchQuery.trim()) return availableBoxes;
    return availableBoxes.filter((b: BoxDetail) =>
      String(b.boxNo).includes(searchQuery.trim())
    );
  }, [availableBoxes, searchQuery]);

  const allSelected =
    availableBoxes.length > 0 &&
    availableBoxes.every((b: BoxDetail) => selectedIds.includes(b.boxNo));
  const selectedCount = selectedIds.length;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleBox = (boxNo: number) => {
    const isSelected = selectedIds.includes(boxNo);
    const newSelected = isSelected
      ? selectedIds.filter((id: number) => id !== boxNo)
      : [...selectedIds, boxNo];
    onSelectionChange(newSelected);
  };

  const toggleAll = () => {
    if (allSelected) {
      onSelectionChange([]);
    } else {
      onSelectionChange(availableBoxes.map((b: BoxDetail) => b.boxNo));
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled || availableBoxes.length === 0}
        className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-sm font-medium transition-all touch-manipulation ${
          disabled || availableBoxes.length === 0
            ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
            : "border-slate-200 bg-white hover:border-blue-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 text-slate-700"
        }`}
      >
        <span className="flex items-center gap-2">
          <Box size={18} className="text-slate-400 shrink-0" />
          {selectedCount > 0 ? (
            <span className="text-slate-800">
              {selectedCount} box{selectedCount > 1 ? "es" : ""} selected
            </span>
          ) : (
            <span className="text-slate-400">Select boxes from pickup</span>
          )}
        </span>
        <ChevronDown
          size={18}
          className={`text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && !disabled && availableBoxes.length > 0 && (
        <div className="absolute z-20 mt-2 w-full bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden max-h-80 flex flex-col">
          <div className="p-2 border-b border-slate-200 flex items-center gap-2 bg-slate-50">
            <Search size={16} className="text-slate-400 shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setSearchQuery(e.target.value)
              }
              placeholder="Search box number..."
              className="flex-1 bg-transparent border-none outline-none text-sm font-medium text-slate-700 placeholder-slate-400 py-1"
              autoFocus
            />
          </div>
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 bg-white text-xs">
            <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              Select All ({availableBoxes.length})
            </label>
            <span className="text-[10px] text-slate-400">
              {selectedCount} selected
            </span>
          </div>
          <div className="flex-1 overflow-y-auto max-h-44 p-1 bg-white">
            {filteredBoxes.length === 0 ? (
              <div className="text-center py-3 text-sm text-slate-400">
                No boxes available.
              </div>
            ) : (
              filteredBoxes.map((box: BoxDetail) => (
                <label
                  key={box.boxNo}
                  className={`flex items-center gap-3 px-2 py-2 rounded-lg cursor-pointer transition-colors ${
                    selectedIds.includes(box.boxNo)
                      ? "bg-blue-50 border border-blue-200"
                      : "hover:bg-slate-50 border border-transparent"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(box.boxNo)}
                    onChange={() => toggleBox(box.boxNo)}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 shrink-0"
                  />
                  <span className="text-xs font-medium text-slate-700 flex-1 flex items-center gap-2 flex-wrap">
                    <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-[10px] font-bold">
                      #{box.boxNo}
                    </span>
                    <span className="text-slate-600">{box.birds} birds</span>
                    <span className="text-slate-300">·</span>
                    <span className="text-slate-600">
                      {box.weight.toFixed(2)} kg
                    </span>
                  </span>
                </label>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}