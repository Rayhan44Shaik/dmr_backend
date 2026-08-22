import React, { useCallback, useState, useEffect, useMemo, useRef } from "react";
import {
  Plus,
  Trash2,
  Save,
  ShoppingCart,
  Layers,
  Hash,
  Scale,
  MessageSquare,
  AlertCircle,
  Check,
  X,
  Box,
  ChevronDown,
  Search,
  Pencil,
  FileText,
  Users,
  Clock,
  Building2,
} from "lucide-react";
import Select from "react-select";
import type { ShopDelivery, BoxDetail } from "../types/trip";
import TripPagination from "./TripPagination";
import jsPDF from "jspdf";

type ShopDeliveryWithExtra = ShopDelivery & {
  deliveryMode?: string;
  selectedBoxIds?: number[];
  farmBirds?: number;
  farmWeight?: number;
  mortKg?: number;
  perBoxData?: { boxNo: number; birds: number; weight: number }[];
  autoCaptureTime?: string;
};

interface BoxSelectorProps {
  boxes: BoxDetail[];
  selectedIds: number[];
  onSelectionChange: (ids: number[]) => void;
  disabled?: boolean;
  usedBoxIds?: number[];
}

function BoxSelector({ boxes, selectedIds, onSelectionChange, disabled = false, usedBoxIds = [] }: BoxSelectorProps) {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const containerRef = useRef<HTMLDivElement>(null);

  const availableBoxes = useMemo<BoxDetail[]>(() => {
    return boxes.filter((b: BoxDetail) => !usedBoxIds.includes(b.boxNo) || selectedIds.includes(b.boxNo));
  }, [boxes, usedBoxIds, selectedIds]);

  const filteredBoxes = useMemo<BoxDetail[]>(() => {
    if (!searchQuery.trim()) return availableBoxes;
    return availableBoxes.filter((b: BoxDetail) => String(b.boxNo).includes(searchQuery.trim()));
  }, [availableBoxes, searchQuery]);

  const allSelected = availableBoxes.length > 0 && availableBoxes.every((b: BoxDetail) => selectedIds.includes(b.boxNo));
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
        className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border bg-slate-50/50 text-sm font-medium transition-all touch-manipulation ${
          disabled || availableBoxes.length === 0
            ? "border-slate-200 text-slate-400 cursor-not-allowed"
            : "border-slate-200 hover:border-blue-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 text-slate-700"
        }`}
      >
        <span className="flex items-center gap-2">
          <Box size={18} className="text-slate-400" />
          {selectedCount > 0 ? (
            <span>{selectedCount} box{selectedCount > 1 ? "es" : ""} selected</span>
          ) : (
            <span className="text-slate-400">Select boxes from pickup</span>
          )}
        </span>
        <ChevronDown size={18} className={`transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && !disabled && availableBoxes.length > 0 && (
        <div className="absolute z-20 mt-2 w-full bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden max-h-80 flex flex-col">
          <div className="p-2 border-b border-slate-200 flex items-center gap-2 bg-slate-50/50">
            <Search size={16} className="text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
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
            <span className="text-[10px] text-slate-400">{selectedCount} selected</span>
          </div>
          <div className="flex-1 overflow-y-auto max-h-44 p-1">
            {filteredBoxes.length === 0 ? (
              <div className="text-center py-3 text-sm text-slate-400">No boxes available.</div>
            ) : (
              filteredBoxes.map((box: BoxDetail) => (
                <label
                  key={box.boxNo}
                  className={`flex items-center gap-3 px-2 py-2 rounded-lg cursor-pointer transition-colors ${
                    selectedIds.includes(box.boxNo)
                      ? "bg-blue-50 border border-blue-200"
                      : "hover:bg-slate-100 border border-transparent"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(box.boxNo)}
                    onChange={() => toggleBox(box.boxNo)}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 shrink-0"
                  />
                  <span className="text-xs font-medium text-slate-700 flex-1 flex items-center gap-2 flex-wrap">
                    <span className="bg-slate-200 text-slate-700 px-2 py-0.5 rounded text-[10px] font-bold">
                      #{box.boxNo}
                    </span>
                    <span className="text-slate-600">{box.birds} birds</span>
                    <span className="text-slate-400">·</span>
                    <span className="text-slate-600">{box.weight.toFixed(2)} kg</span>
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

// ─── Main Component ──────────────────────────────────────────────────
interface Props {
  rows: ShopDelivery[];
  setRows: React.Dispatch<React.SetStateAction<ShopDelivery[]>>;
  shops: any[];
  birdTypes: any[];
  boxDetails?: BoxDetail[];
  readOnly?: boolean;
  onSaveRow?: (row: ShopDelivery) => void;
  tripNo?: string;
  vehicleNo?: string;
  supervisorName?: string;
  supervisorPhone?: string;
  tripDate?: string;
}

function UnLoadingTable({
  rows,
  setRows,
  shops,
  birdTypes,
  boxDetails = [],
  readOnly = false,
  onSaveRow,
  tripNo = "",
  vehicleNo = "",
  supervisorName = "",
  supervisorPhone = "",
  tripDate = "",
}: Props) {
  const safeRows = rows ?? [];
  const safeShops = shops ?? [];
  const safeBirdTypes = birdTypes ?? [];
  const safeBoxDetails = boxDetails ?? [];

  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 10;

  const [showForm, setShowForm] = useState<boolean>(false);
  const [mode, setMode] = useState<"box" | "weight">("box");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [autoCaptureTime, setAutoCaptureTime] = useState<string>("");

  const [formData, setFormData] = useState<{
    shopId: number;
    shopName: string;
    birdTypeId: number;
    birdType: string;
    selectedBoxIds: number[];
    birds: number;
    weight: number;
    mortality: number;
    mortWeight: number;
    remarks: string;
    perBoxData: { boxNo: number; birds: number; weight: number }[];
  }>({
    shopId: 0,
    shopName: "",
    birdTypeId: 0,
    birdType: "",
    selectedBoxIds: [],
    birds: 0,
    weight: 0,
    mortality: 0,
    mortWeight: 0,
    remarks: "",
    perBoxData: [],
  });

  const [validationErrors, setValidationErrors] = useState<{
    birdsExceed: boolean;
    birdsMismatch: boolean;
    weightMismatch: boolean;
    birdsExceedFarm: boolean;
    weightExceedFarm: boolean;
    perBoxBirdsErrors: boolean[];
    perBoxWeightErrors: boolean[];
  }>({
    birdsExceed: false,
    birdsMismatch: false,
    weightMismatch: false,
    birdsExceedFarm: false,
    weightExceedFarm: false,
    perBoxBirdsErrors: [],
    perBoxWeightErrors: [],
  });

  // ─── Top KPI Calculations ────────────────────────────────────
  const topKpiTotals = useMemo(() => {
    const totalShops = safeRows.length;
    const totalBirds = safeRows.reduce((acc, r) => acc + (r.birds || 0), 0);
    const totalWeight = safeRows.reduce((acc, r) => acc + (r.weight || 0), 0);
    const totalMortality = safeRows.reduce((acc, r) => acc + (r.mortality || 0), 0);
    const totalMortKg = safeRows.reduce((acc, r) => {
      const extra = r as ShopDeliveryWithExtra;
      return acc + (extra.mortKg || 0);
    }, 0);

    const latestCaptured = safeRows.reduce((latest, r) => {
      const extra = r as ShopDeliveryWithExtra;
      return extra.autoCaptureTime || latest;
    }, "");

    return {
      shops: totalShops,
      birds: totalBirds,
      weight: totalWeight,
      mortality: totalMortality,
      mortKg: totalMortKg,
      lastCaptureTime: latestCaptured || new Date().toLocaleString(),
    };
  }, [safeRows]);

  // ─── Compute used box numbers ──────────────────────────────────
  const usedBoxIds = useMemo<number[]>(() => {
    const used = new Set<number>();
    safeRows.forEach((row: ShopDelivery) => {
      if (editingId !== null && row.id === editingId) return;
      const rowWithExtra = row as ShopDeliveryWithExtra;
      if (rowWithExtra.selectedBoxIds && rowWithExtra.selectedBoxIds.length > 0) {
        rowWithExtra.selectedBoxIds.forEach((id: number) => used.add(id));
      }
    });
    return Array.from(used);
  }, [safeRows, editingId]);

  // ─── Available boxes ───────────────────────────────────────────
  const availableBoxDetails = useMemo<BoxDetail[]>(() => {
    return safeBoxDetails.filter(
      (b: BoxDetail) => !usedBoxIds.includes(b.boxNo) || formData.selectedBoxIds.includes(b.boxNo)
    );
  }, [safeBoxDetails, usedBoxIds, formData.selectedBoxIds]);

  // ─── Farm values ──────────────────────────────────────────────
  const farmBirds = useMemo<number>(() => {
    const selected = availableBoxDetails.filter((b: BoxDetail) => formData.selectedBoxIds.includes(b.boxNo));
    return selected.reduce((sum: number, b: BoxDetail) => sum + b.birds, 0);
  }, [availableBoxDetails, formData.selectedBoxIds]);

  const farmWeight = useMemo<number>(() => {
    const selected = availableBoxDetails.filter((b: BoxDetail) => formData.selectedBoxIds.includes(b.boxNo));
    return selected.reduce((sum: number, b: BoxDetail) => sum + b.weight, 0);
  }, [availableBoxDetails, formData.selectedBoxIds]);

  const boxCount = formData.selectedBoxIds.length;

  // ─── Weight mode totals ──────────────────────────────────────
  const weightModeTotals = useMemo<{ birds: number; weight: number }>(() => {
    if (mode !== "weight") return { birds: 0, weight: 0 };
    const totalBirds = formData.perBoxData.reduce((sum: number, item: { boxNo: number; birds: number; weight: number }) => sum + item.birds, 0);
    const totalWeight = formData.perBoxData.reduce((sum: number, item: { boxNo: number; birds: number; weight: number }) => sum + item.weight, 0);
    return { birds: totalBirds, weight: totalWeight };
  }, [formData.perBoxData, mode]);

  // ─── Mortality weight ──────────────────────────────────────────
  const mortKg = useMemo<number>(() => {
    if (mode === "box") {
      if (farmBirds > 0 && formData.mortality > 0) {
        return (farmWeight / farmBirds) * formData.mortality;
      }
      return 0;
    } else {
      return formData.mortWeight || 0;
    }
  }, [mode, farmBirds, farmWeight, formData.mortality, formData.mortWeight]);

  const deliveredBirds = mode === "box" ? Math.max(0, farmBirds - formData.mortality) : weightModeTotals.birds;
  const deliveredWeight = mode === "box" ? Math.max(0, farmWeight - mortKg) : weightModeTotals.weight;

  // ─── Weight Loss (only for Weight mode) ──────────────────────
  const weightLoss = useMemo<number>(() => {
    if (mode !== "weight") return 0;
    const totalDeliveredWeight = weightModeTotals.weight;
    const totalMortalityWeight = formData.mortWeight || 0;
    return Math.max(0, farmWeight - (totalDeliveredWeight + totalMortalityWeight));
  }, [mode, farmWeight, weightModeTotals.weight, formData.mortWeight]);

  // ─── Validation ──────────────────────────────────────────────────
  const validate = useCallback(() => {
    let birdsExceed = false;
    let birdsMismatch = false;
    let weightMismatch = false;
    let birdsExceedFarm = false;
    let weightExceedFarm = false;
    const perBoxBirdsErrors: boolean[] = [];
    const perBoxWeightErrors: boolean[] = [];

    if (mode === "box") {
      birdsExceed = formData.mortality > farmBirds && farmBirds > 0;
    } else {
      const totalBirds = weightModeTotals.birds + formData.mortality;
      const totalWeight = weightModeTotals.weight + mortKg;

      if (farmBirds > 0) {
        if (totalBirds > farmBirds) {
          birdsExceedFarm = true;
        } else if (totalBirds !== farmBirds) {
          birdsMismatch = true;
        }
      }
      if (farmWeight > 0) {
        if (totalWeight > farmWeight) {
          weightExceedFarm = true;
        }
      }

      formData.perBoxData.forEach((item, index) => {
        const farmBox = availableBoxDetails.find((b) => b.boxNo === item.boxNo);
        if (farmBox) {
          perBoxBirdsErrors[index] = item.birds > farmBox.birds;
          perBoxWeightErrors[index] = item.weight > farmBox.weight;
        } else {
          perBoxBirdsErrors[index] = false;
          perBoxWeightErrors[index] = false;
        }
      });
    }

    setValidationErrors({
      birdsExceed,
      birdsMismatch,
      weightMismatch,
      birdsExceedFarm,
      weightExceedFarm,
      perBoxBirdsErrors,
      perBoxWeightErrors,
    });
    return (
      !birdsExceed &&
      !birdsMismatch &&
      !weightMismatch &&
      !birdsExceedFarm &&
      !weightExceedFarm &&
      !perBoxBirdsErrors.some((err) => err) &&
      !perBoxWeightErrors.some((err) => err)
    );
  }, [mode, farmBirds, farmWeight, formData.mortality, formData.mortWeight, weightModeTotals, mortKg, formData.perBoxData, availableBoxDetails]);

  useEffect(() => {
    validate();
  }, [mode, farmBirds, farmWeight, formData.mortality, formData.mortWeight, weightModeTotals, mortKg, formData.perBoxData, availableBoxDetails, validate]);

  useEffect(() => {
    if (mode === "box") {
      setFormData((prev) => ({ ...prev, birds: 0, weight: 0, perBoxData: [], mortWeight: 0 }));
    } else {
      if (formData.selectedBoxIds.length > 0 && formData.perBoxData.length === 0) {
        const initialData = formData.selectedBoxIds.map((boxNo: number) => ({
          boxNo,
          birds: 0,
          weight: 0,
        }));
        setFormData((prev) => ({ ...prev, perBoxData: initialData, mortWeight: 0 }));
      }
    }
  }, [mode]);

  useEffect(() => {
    if (mode === "weight") {
      const currentBoxNos = formData.perBoxData.map((item: { boxNo: number }) => item.boxNo);
      const newBoxNos = formData.selectedBoxIds.filter((id: number) => !currentBoxNos.includes(id));
      const removedBoxNos = currentBoxNos.filter((id: number) => !formData.selectedBoxIds.includes(id));
      if (newBoxNos.length > 0 || removedBoxNos.length > 0) {
        let updated = formData.perBoxData.filter((item: { boxNo: number }) => formData.selectedBoxIds.includes(item.boxNo));
        newBoxNos.forEach((boxNo: number) => {
          updated.push({ boxNo, birds: 0, weight: 0 });
        });
        updated.sort((a: { boxNo: number }, b: { boxNo: number }) => a.boxNo - b.boxNo);
        setFormData((prev) => ({ ...prev, perBoxData: updated }));
      }
    }
  }, [formData.selectedBoxIds, mode]);

  // ─── Display rows ──────────────────────────────────────────────────
  const displayRows = useMemo<ShopDelivery[]>(() => {
    const saved = safeRows.filter((r: ShopDelivery) => r.shopId > 0 && r.birds > 0 && r.weight > 0);
    return [...saved].sort((a: ShopDelivery, b: ShopDelivery) => b.id - a.id);
  }, [safeRows]);

  const totalPages = useMemo<number>(() => Math.ceil(displayRows.length / itemsPerPage), [displayRows.length]);

  const currentRows = useMemo<ShopDelivery[]>(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return displayRows.slice(startIndex, startIndex + itemsPerPage);
  }, [displayRows, currentPage]);

  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(1);
    } else if (totalPages === 0) {
      setCurrentPage(1);
    }
  }, [totalPages, currentPage]);

  // ─── Form handlers ────────────────────────────────────────────────
  const openAddForm = () => {
    setEditingId(null);
    setMode("box");
    setAutoCaptureTime(new Date().toLocaleString());
    setFormData({
      shopId: 0,
      shopName: "",
      birdTypeId: 0,
      birdType: "",
      selectedBoxIds: [],
      birds: 0,
      weight: 0,
      mortality: 0,
      mortWeight: 0,
      remarks: "",
      perBoxData: [],
    });
    setValidationErrors({
      birdsExceed: false,
      birdsMismatch: false,
      weightMismatch: false,
      birdsExceedFarm: false,
      weightExceedFarm: false,
      perBoxBirdsErrors: [],
      perBoxWeightErrors: [],
    });
    setShowForm(true);
  };

  const openEditForm = (row: ShopDelivery) => {
    const rowWithExtra = row as ShopDeliveryWithExtra;
    setEditingId(row.id);
    const modeFromRow = rowWithExtra.deliveryMode || "box";
    setMode(modeFromRow as "box" | "weight");
    setAutoCaptureTime(rowWithExtra.autoCaptureTime || new Date().toLocaleString());
    const perBoxData = rowWithExtra.perBoxData || [];
    setFormData({
      shopId: row.shopId,
      shopName: row.shopName,
      birdTypeId: row.birdTypeId,
      birdType: row.birdType,
      selectedBoxIds: rowWithExtra.selectedBoxIds || [],
      birds: row.birds,
      weight: row.weight,
      mortality: row.mortality || 0,
      mortWeight: rowWithExtra.mortKg || 0,
      remarks: row.remarks || "",
      perBoxData: perBoxData,
    });
    setValidationErrors({
      birdsExceed: false,
      birdsMismatch: false,
      weightMismatch: false,
      birdsExceedFarm: false,
      weightExceedFarm: false,
      perBoxBirdsErrors: [],
      perBoxWeightErrors: [],
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
  };

  const handleFormChange = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handlePerBoxChange = (index: number, field: "birds" | "weight", value: number) => {
    setFormData((prev) => {
      const updated = [...prev.perBoxData];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, perBoxData: updated };
    });
  };

  const handleBoxSelection = (newSelectedIds: number[]) => {
    setFormData((prev) => ({
      ...prev,
      selectedBoxIds: newSelectedIds,
    }));
  };

  const handleShopSelect = (selected: any) => {
    if (selected) {
      setFormData((prev) => ({
        ...prev,
        shopId: selected.value,
        shopName: selected.label,
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        shopId: 0,
        shopName: "",
      }));
    }
  };

  const handleBirdSelect = (selected: any) => {
    if (selected) {
      const bird = safeBirdTypes.find((b: any) => (b.id ?? b.birdTypeId) === selected.value);
      setFormData((prev) => ({
        ...prev,
        birdTypeId: selected.value,
        birdType: bird ? (bird.birdType ?? bird.name ?? "") : "",
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        birdTypeId: 0,
        birdType: "",
      }));
    }
  };

  const handleSubmit = () => {
    if (validationErrors.birdsExceedFarm) {
      alert(`⚠️ Cannot exceed more than Temple Birds (${farmBirds}).`);
      return;
    }
    if (validationErrors.weightExceedFarm) {
      alert(`⚠️ Cannot exceed more than Temple Wt (${farmWeight.toFixed(2)}).`);
      return;
    }
    if (validationErrors.perBoxBirdsErrors.some((err) => err)) {
      alert("⚠️ Some boxes have Birds(Del.) exceeding Birds(Temple). Please fix.");
      return;
    }
    if (validationErrors.perBoxWeightErrors.some((err) => err)) {
      alert("⚠️ Some boxes have Wt(Del.) exceeding Wt(Temple). Please fix.");
      return;
    }
    if (!validate()) {
      alert("Please fix the validation errors before saving.");
      return;
    }

    if (formData.shopId === 0) {
      alert("Please select a Shop.");
      return;
    }

    let finalBirds = formData.birds;
    let finalWeight = formData.weight;
    let selectedBoxIds: number[] = [];
    let farmBirdsVal = 0;
    let farmWeightVal = 0;
    let mortKgVal = 0;
    let perBoxData: { boxNo: number; birds: number; weight: number }[] = [];

    if (mode === "box") {
      if (formData.mortality < 0) {
        alert("Mortality cannot be negative.");
        return;
      }
      if (formData.selectedBoxIds.length === 0) {
        alert("Please select at least one box.");
        return;
      }
      selectedBoxIds = formData.selectedBoxIds;
      farmBirdsVal = farmBirds;
      farmWeightVal = farmWeight;
      mortKgVal = mortKg;
      finalBirds = farmBirds - formData.mortality;
      finalWeight = farmWeight - mortKg;
      perBoxData = [];
    } else {
      if (formData.selectedBoxIds.length === 0) {
        alert("Please select at least one box.");
        return;
      }
      for (const item of formData.perBoxData) {
        if (item.birds < 0 || item.weight < 0) {
          alert("Values cannot be negative.");
          return;
        }
      }
      if (formData.mortality < 0 || formData.mortWeight < 0) {
        alert("Mortality values cannot be negative.");
        return;
      }
      selectedBoxIds = formData.selectedBoxIds;
      farmBirdsVal = farmBirds;
      farmWeightVal = farmWeight;
      const totalBirds = formData.perBoxData.reduce((sum: number, item: { boxNo: number; birds: number; weight: number }) => sum + item.birds, 0);
      const totalWeight = formData.perBoxData.reduce((sum: number, item: { boxNo: number; birds: number; weight: number }) => sum + item.weight, 0);
      finalBirds = totalBirds;
      finalWeight = totalWeight;
      mortKgVal = formData.mortWeight;
      perBoxData = formData.perBoxData.map((item: { boxNo: number; birds: number; weight: number }) => ({ ...item }));
    }

    const maxSerial = safeRows.reduce((max: number, r: ShopDelivery) => Math.max(max, r.serialNo || 0), 0);
    const newRow: ShopDeliveryWithExtra = {
      id: editingId ?? Date.now(),
      serialNo: editingId ? (safeRows.find((r: ShopDelivery) => r.id === editingId)?.serialNo || maxSerial + 1) : maxSerial + 1,
      shopId: formData.shopId,
      shopName: formData.shopName,
      birdTypeId: formData.birdTypeId,
      birdType: formData.birdType,
      boxNo: formData.selectedBoxIds.length,
      birds: finalBirds,
      weight: finalWeight,
      mortality: formData.mortality,
      remarks: formData.remarks || "",
      rate: 0,
      amount: 0,
      deliveryMode: mode,
      selectedBoxIds: selectedBoxIds,
      farmBirds: farmBirdsVal,
      farmWeight: farmWeightVal,
      mortKg: mortKgVal,
      perBoxData: perBoxData,
      autoCaptureTime: autoCaptureTime || new Date().toLocaleString(),
    };

    if (editingId !== null) {
      setRows((prev: ShopDelivery[]) => prev.map((r: ShopDelivery) => (r.id === editingId ? newRow : r)));
      if (onSaveRow) onSaveRow(newRow);
    } else {
      if (onSaveRow) onSaveRow(newRow);
      setRows((prev: ShopDelivery[]) => [newRow, ...prev]);
    }
    setShowForm(false);
    setEditingId(null);
    setCurrentPage(1);
  };

  // ─── PDF generation ────────────────────────────────────────────────
  const generatePDF = (row: ShopDeliveryWithExtra) => {
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const primaryColor: [number, number, number] = [37, 99, 235];
      const secondaryColor: [number, number, number] = [71, 85, 105];

      doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.rect(0, 0, pageWidth, 6, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(24);
      doc.setTextColor(15, 23, 42);
      doc.text('DMR POULTRY', 14, 22);
      doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
      doc.setLineWidth(0.8);
      doc.line(14, 26, 14 + doc.getStringUnitWidth('DMR POULTRY') * 24 * 0.6, 26);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);

      const leftX = 14;
      const rightX = pageWidth - 14;
      const yStart = 36;
      doc.setFont('helvetica', 'bold');
      doc.text(`Vehicle No : ${vehicleNo || 'N/A'}`, leftX, yStart);
      doc.text(`Supervisor Name : ${supervisorName || 'N/A'}`, leftX, yStart + 8);
      doc.text(`Supervisor No : ${supervisorPhone || 'N/A'}`, leftX, yStart + 16);

      doc.setFont('helvetica', 'normal');
      doc.text(`Shop Name : ${row.shopName}`, rightX, yStart, { align: 'right' });
      doc.text(`Date : ${tripDate || new Date().toLocaleDateString()}`, rightX, yStart + 8, { align: 'right' });
      doc.text(`Captured : ${row.autoCaptureTime || 'N/A'}`, rightX, yStart + 16, { align: 'right' });

      const isBoxMode = row.deliveryMode === 'box';
      let y = yStart + 28;

      if (isBoxMode) {
        const boxNumbers = row.selectedBoxIds && row.selectedBoxIds.length > 0
          ? row.selectedBoxIds.sort((a: number, b: number) => a - b).join(', ')
          : 'N/A';
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text('Box no\'s Delivered:', leftX, y);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.text(boxNumbers, leftX + 50, y);
        y += 12;

        const colX = [14, 50, 90, 130];
        const colWidths = [36, 40, 40, 40];
        const tableY = y;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(255, 255, 255);
        doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.rect(colX[0], tableY, colWidths.reduce((a: number, b: number) => a + b, 0), 8, 'F');
        doc.text('', colX[0] + 2, tableY + 5);
        doc.text('Unloading Temple', colX[1] + 2, tableY + 5);
        doc.text('Mor', colX[2] + 2, tableY + 5);
        doc.text('Final Birds', colX[3] + 2, tableY + 5);
        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'normal');
        doc.setFillColor(248, 250, 252);
        const row1Y = tableY + 8;
        doc.rect(colX[0], row1Y, colWidths.reduce((a: number, b: number) => a + b, 0), 7, 'F');
        doc.text('Birds (Wt)', colX[0] + 2, row1Y + 5);
        doc.text(String(row.farmBirds || 0), colX[1] + 2, row1Y + 5);
        doc.text(String(row.mortality), colX[2] + 2, row1Y + 5);
        doc.text(String(row.birds), colX[3] + 2, row1Y + 5);
        const row2Y = row1Y + 7;
        doc.rect(colX[0], row2Y, colWidths.reduce((a: number, b: number) => a + b, 0), 7, 'F');
        doc.text('Wt (Kg)', colX[0] + 2, row2Y + 5);
        doc.text((row.farmWeight || 0).toFixed(2), colX[1] + 2, row2Y + 5);
        doc.text((row.mortKg || 0).toFixed(2), colX[2] + 2, row2Y + 5);
        doc.text(row.weight.toFixed(2), colX[3] + 2, row2Y + 5);
        y = row2Y + 12;
      } else {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text('Per-Box Delivery Details', leftX, y);
        y += 8;
        if (row.perBoxData && row.perBoxData.length > 0) {
          doc.setFontSize(9);
          const colX = [14, 40, 70, 100, 130];
          doc.setFillColor(240, 242, 245);
          doc.rect(colX[0], y, 26, 6, 'F');
          doc.text('Box', colX[0] + 2, y + 4);
          doc.rect(colX[1], y, 30, 6, 'F');
          doc.text('Birds (Temple)', colX[1] + 2, y + 4);
          doc.rect(colX[2], y, 30, 6, 'F');
          doc.text('Birds (Del.)', colX[2] + 2, y + 4);
          doc.rect(colX[3], y, 30, 6, 'F');
          doc.text('Wt (Temple)', colX[3] + 2, y + 4);
          doc.rect(colX[4], y, 30, 6, 'F');
          doc.text('Wt (Del.)', colX[4] + 2, y + 4);
          y += 8;
          doc.setFillColor(255, 255, 255);
          row.perBoxData.forEach((item: { boxNo: number; birds: number; weight: number }) => {
            const farmBox = safeBoxDetails.find((b: BoxDetail) => b.boxNo === item.boxNo);
            doc.text(String(item.boxNo), colX[0] + 2, y + 4);
            doc.text(String(farmBox?.birds || 0), colX[1] + 2, y + 4);
            doc.text(String(item.birds), colX[2] + 2, y + 4);
            doc.text((farmBox?.weight || 0).toFixed(2), colX[3] + 2, y + 4);
            doc.text(item.weight.toFixed(2), colX[4] + 2, y + 4);
            y += 6;
          });
          const totalBirds = row.perBoxData.reduce((s: number, i: { boxNo: number; birds: number; weight: number }) => s + i.birds, 0);
          const totalWeight = row.perBoxData.reduce((s: number, i: { boxNo: number; birds: number; weight: number }) => s + i.weight, 0);
          doc.setFont('helvetica', 'bold');
          doc.text('Totals:', colX[0] + 2, y + 4);
          doc.text(String(totalBirds), colX[2] + 2, y + 4);
          doc.text(totalWeight.toFixed(2), colX[4] + 2, y + 4);
          y += 10;
        } else {
          doc.text('No per-box data available.', leftX, y);
          y += 6;
        }
        doc.setFont('helvetica', 'bold');
        doc.text('Mortality & Loss:', leftX, y);
        y += 6;
        doc.setFont('helvetica', 'normal');
        doc.text(`Mor (Birds): ${row.mortality}`, leftX, y);
        doc.text(`Mor (kg): ${(row.mortKg || 0).toFixed(2)}`, leftX + 60, y);
        const totalDelWt = row.perBoxData?.reduce((s, i) => s + i.weight, 0) || 0;
        const loss = Math.max(0, (row.farmWeight || 0) - (totalDelWt + (row.mortKg || 0)));
        doc.text(`Weight Loss: ${loss.toFixed(2)} kg`, leftX + 120, y);
        y += 10;
      }

      doc.setFont('helvetica', 'italic');
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text('Thank You', pageWidth / 2, y + 10, { align: 'center' });

      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(`Generated: ${new Date().toLocaleString()}`, leftX, doc.internal.pageSize.getHeight() - 10);

      doc.save(`ShopDelivery_${row.shopName.replace(/\s/g, '_')}_${isBoxMode ? 'Box' : 'Weight'}.pdf`);
    } catch (error) {
      console.error("PDF generation error:", error);
      alert("Failed to generate PDF. Please try again.");
    }
  };

  // ─── Options ───────────────────────────────────────────────────────
  const shopOptions = useMemo(() => {
    if (!safeShops || safeShops.length === 0) {
      return [{ value: 0, label: "No shops available", isDisabled: true }];
    }
    const opts = safeShops
      .map((shop: any) => {
        const value = shop.id ?? shop.shopId ?? 0;
        const label = shop.shopName ?? shop.name ?? `Shop ${value}`;
        return { value, label, isDisabled: false };
      })
      .filter((opt: { value: number; label: string; isDisabled: boolean }) => opt.value > 0);
    opts.sort((a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label));
    return opts;
  }, [safeShops]);

  const birdOptions = useMemo(() => {
    if (!safeBirdTypes || safeBirdTypes.length === 0) {
      return [{ value: 0, label: "No bird types available", isDisabled: true }];
    }
    return safeBirdTypes
      .map((bird: any) => {
        const value = bird.id ?? bird.birdTypeId ?? 0;
        const label = bird.birdType ?? bird.name ?? `Bird ${value}`;
        return { value, label, isDisabled: false };
      })
      .filter((opt: { value: number; label: string; isDisabled: boolean }) => opt.value > 0);
  }, [safeBirdTypes]);

  const isFormValid = useMemo<boolean>(() => {
    if (mode === "box") {
      return (
        formData.shopId > 0 &&
        formData.selectedBoxIds.length > 0 &&
        farmBirds > 0 &&
        formData.mortality >= 0 &&
        formData.mortality <= farmBirds &&
        !validationErrors.birdsExceed
      );
    } else {
      const allBoxesFilled = formData.perBoxData.every(
        (item: { boxNo: number; birds: number; weight: number }) => item.birds > 0 && item.weight > 0
      );
      const noPerBoxErrors =
        !validationErrors.perBoxBirdsErrors.some((err) => err) &&
        !validationErrors.perBoxWeightErrors.some((err) => err);
      return (
        formData.shopId > 0 &&
        formData.selectedBoxIds.length > 0 &&
        allBoxesFilled &&
        formData.mortality >= 0 &&
        formData.mortWeight >= 0 &&
        !validationErrors.birdsExceed &&
        !validationErrors.birdsMismatch &&
        !validationErrors.birdsExceedFarm &&
        !validationErrors.weightExceedFarm &&
        noPerBoxErrors
      );
    }
  }, [mode, formData, farmBirds, validationErrors]);

  // ─── Render ────────────────────────────────────────────────────────
  return (
    <div className="w-full space-y-4">
      <style>{`
        .no-spinner::-webkit-inner-spin-button,.no-spinner::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}.no-spinner{-moz-appearance:textfield}
      `}</style>

      {/* Top Auto-Capture KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-emerald-50/70 border border-emerald-100 p-3 rounded-xl flex flex-col justify-between shadow-xs">
          <span className="text-xs font-semibold text-emerald-800 flex items-center gap-1">
            <Clock size={13} className="text-emerald-600" /> Captured Time
          </span>
          <span className="text-xs font-bold text-slate-800 mt-1 truncate" title={topKpiTotals.lastCaptureTime}>
            {topKpiTotals.lastCaptureTime}
          </span>
        </div>

        <div className="bg-white border border-slate-200/80 p-3 rounded-xl flex flex-col justify-between shadow-xs">
          <span className="text-xs font-medium text-slate-500 flex items-center gap-1">
            <Building2 size={13} className="text-slate-400" /> Shops
          </span>
          <span className="text-base font-bold text-slate-800">{topKpiTotals.shops}</span>
        </div>

        <div className="bg-white border border-slate-200/80 p-3 rounded-xl flex flex-col justify-between shadow-xs">
          <span className="text-xs font-medium text-slate-500 flex items-center gap-1">
            <Users size={13} className="text-blue-500" /> Birds
          </span>
          <span className="text-base font-bold text-slate-800">{topKpiTotals.birds}</span>
        </div>

        <div className="bg-white border border-slate-200/80 p-3 rounded-xl flex flex-col justify-between shadow-xs">
          <span className="text-xs font-medium text-slate-500 flex items-center gap-1">
            <Scale size={13} className="text-emerald-500" /> Weight (kg)
          </span>
          <span className="text-base font-bold text-slate-800">{topKpiTotals.weight.toFixed(2)}</span>
        </div>

        <div className="bg-white border border-slate-200/80 p-3 rounded-xl flex flex-col justify-between shadow-xs">
          <span className="text-xs font-medium text-slate-500 flex items-center gap-1">
            <AlertCircle size={13} className="text-rose-500" /> Mor
          </span>
          <span className="text-base font-bold text-slate-800">{topKpiTotals.mortality}</span>
        </div>

        <div className="bg-white border border-slate-200/80 p-3 rounded-xl flex flex-col justify-between shadow-xs">
          <span className="text-xs font-medium text-slate-500 flex items-center gap-1">
            <Scale size={13} className="text-rose-500" /> Mor (kg)
          </span>
          <span className="text-base font-bold text-slate-800">{topKpiTotals.mortKg.toFixed(2)}</span>
        </div>
      </div>

      {/* Header action button */}
      {!readOnly && !showForm && (
        <div className="flex justify-end">
          <button
            onClick={openAddForm}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-xl shadow-xs transition-all active:scale-95 touch-manipulation"
          >
            <Plus size={18} />
            Add Shop
          </button>
        </div>
      )}

      {showForm ? (
        // ─── FORM VIEW ──────────────────────────────────────────────
        <div className="p-4 sm:p-6 bg-white border border-slate-200 rounded-2xl shadow-sm space-y-5">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div>
              <h3 className="text-base sm:text-lg font-semibold text-slate-800">
                {editingId !== null ? "Edit Shop Delivery" : "Add New Shop Delivery"}
              </h3>
              <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                <Clock size={12} /> Auto-Captured: <span className="font-medium text-slate-600">{autoCaptureTime}</span>
              </p>
            </div>
            <button
              onClick={closeForm}
              className="h-10 w-10 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors touch-manipulation"
            >
              <X size={20} />
            </button>
          </div>

          {/* Row 1: Delivery Mode + Shop Name */}
          <div className="flex flex-col sm:flex-row gap-4 sm:gap-5">
            <div className="sm:w-[40%]">
              <label className="text-sm font-medium text-slate-700 block mb-1.5">Delivery Mode</label>
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl w-fit">
                <button
                  type="button"
                  onClick={() => setMode("box")}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all touch-manipulation ${
                    mode === "box"
                      ? "bg-white text-blue-700 shadow-xs"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  Box Mode
                </button>
                <button
                  type="button"
                  onClick={() => setMode("weight")}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all touch-manipulation ${
                    mode === "weight"
                      ? "bg-white text-blue-700 shadow-xs"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  Weight Mode
                </button>
              </div>
            </div>

            <div className="sm:w-[60%]">
              <label className="text-sm font-medium text-slate-700 flex items-center gap-1.5 mb-1">
                <ShoppingCart size={16} className="text-slate-400" /> Shop Name{" "}
                <span className="text-rose-500">*</span>
              </label>
              <Select
                key={`shop-${shopOptions.length}`}
                value={
                  formData.shopId
                    ? { value: formData.shopId, label: formData.shopName }
                    : null
                }
                options={shopOptions}
                placeholder={shopOptions.length > 0 ? "Search Shop..." : "No shops available"}
                isSearchable
                isDisabled={shopOptions.length === 0 || shopOptions[0]?.isDisabled}
                onChange={handleShopSelect}
                maxMenuHeight={140}
                styles={{
                  control: (base: any) => ({
                    ...base,
                    minHeight: 44,
                    borderRadius: 12,
                    borderColor: "#e2e8f0",
                    backgroundColor: "#f8fafc",
                  }),
                  menu: (base: any) => ({
                    ...base,
                    zIndex: 9999,
                    borderRadius: 12,
                    overflow: "hidden",
                    boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.15)",
                  }),
                  option: (base: any, state: any) => ({
                    ...base,
                    backgroundColor: state.isFocused ? "#e2e8f0" : "white",
                    color: "#1e293b",
                    cursor: "pointer",
                    padding: 8,
                  }),
                }}
              />
              <div className="text-[10px] text-slate-400 mt-1">
                {shopOptions.length} shop(s) available
              </div>
            </div>
          </div>

          {/* Row 2: Bird Type + Box Selector */}
          <div className="flex flex-col sm:flex-row gap-4 sm:gap-5">
            <div className="sm:w-[40%]">
              <label className="text-sm font-medium text-slate-700 flex items-center gap-1.5 mb-1">
                <Layers size={16} className="text-slate-400" /> Bird Type{" "}
                <span className="text-rose-500">*</span>
              </label>
              <Select
                key={`bird-${birdOptions.length}`}
                value={
                  formData.birdTypeId
                    ? { value: formData.birdTypeId, label: formData.birdType }
                    : null
                }
                options={birdOptions}
                placeholder={birdOptions.length > 0 ? "Select Bird..." : "No bird types available"}
                isSearchable
                isDisabled={birdOptions.length === 0 || birdOptions[0]?.isDisabled}
                onChange={handleBirdSelect}
                maxMenuHeight={140}
                styles={{
                  control: (base: any) => ({
                    ...base,
                    minHeight: 44,
                    borderRadius: 12,
                    borderColor: "#e2e8f0",
                    backgroundColor: "#f8fafc",
                  }),
                  menu: (base: any) => ({
                    ...base,
                    zIndex: 9999,
                    borderRadius: 12,
                    overflow: "hidden",
                    boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.15)",
                  }),
                  option: (base: any, state: any) => ({
                    ...base,
                    backgroundColor: state.isFocused ? "#e2e8f0" : "white",
                    color: "#1e293b",
                    cursor: "pointer",
                    padding: 8,
                  }),
                }}
              />
              <div className="text-[10px] text-slate-400 mt-1">
                {birdOptions.length} bird type(s) available
              </div>
            </div>

            <div className="sm:w-[60%]">
              <label className="text-sm font-medium text-slate-700 block mb-1.5">Select Boxes</label>
              {safeBoxDetails.length > 0 ? (
                <BoxSelector
                  boxes={safeBoxDetails}
                  selectedIds={formData.selectedBoxIds}
                  onSelectionChange={handleBoxSelection}
                  disabled={readOnly}
                  usedBoxIds={usedBoxIds}
                />
              ) : (
                <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/50 text-center">
                  <AlertCircle size={20} className="mx-auto mb-1 text-slate-300" />
                  <p className="text-sm text-slate-500">No boxes available from pickup.</p>
                </div>
              )}
            </div>
          </div>

          {/* ─── Conditional Grid ────────────────────────────────────── */}
          {mode === "box" ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6">
                <div>
                  <label className="text-sm font-medium text-slate-700 flex items-center gap-1.5 mb-1">
                    <Box size={16} className="text-slate-400" /> Box No
                  </label>
                  <div className="w-full rounded-xl border border-slate-200 bg-slate-100/50 px-4 sm:px-5 py-2 text-sm font-medium text-slate-600 flex items-center h-[44px]">
                    {boxCount}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 flex items-center gap-1.5 mb-1">
                    <span>🕌</span> Temple Birds
                  </label>
                  <div className="w-full rounded-xl border border-slate-200 bg-slate-100/50 px-4 sm:px-5 py-2 text-sm font-medium text-slate-600 flex items-center h-[44px]">
                    {farmBirds}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 flex items-center gap-1.5 mb-1">
                    <span>⚰️</span> Mor (Birds)
                  </label>
                  <input
                    type="number"
                    value={formData.mortality || ""}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      handleFormChange("mortality", Number(e.target.value))
                    }
                    placeholder="0"
                    min="0"
                    className={`w-full rounded-xl border px-4 sm:px-5 py-2 text-sm font-medium outline-none transition-all no-spinner h-[44px] ${
                      validationErrors.birdsExceed
                        ? "border-red-500 bg-red-50 focus:border-red-600 focus:ring-red-200"
                        : "border-slate-200 bg-slate-50/50 text-slate-700 focus:bg-white focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10"
                    }`}
                  />
                  {validationErrors.birdsExceed && (
                    <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                      <AlertCircle size={12} /> Cannot be more than {farmBirds}
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 flex items-center gap-1.5 mb-1">
                    <span>🐔</span> Birds (Del.)
                  </label>
                  <div className="w-full rounded-xl border border-slate-200 bg-slate-100/50 px-4 sm:px-5 py-2 text-sm font-medium text-slate-600 flex items-center h-[44px]">
                    {deliveredBirds}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6">
                <div />
                <div>
                  <label className="text-sm font-medium text-slate-700 flex items-center gap-1.5 mb-1">
                    <Scale size={16} className="text-slate-400" /> Wt (Temple)
                  </label>
                  <div className="w-full rounded-xl border border-slate-200 bg-slate-100/50 px-4 sm:px-5 py-2 text-sm font-medium text-slate-600 flex items-center h-[44px]">
                    {farmWeight.toFixed(2)}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 flex items-center gap-1.5 mb-1">
                    <Scale size={16} className="text-slate-400" /> Mor (kg)
                  </label>
                  <div className="w-full rounded-xl border border-slate-200 bg-slate-100/50 px-4 sm:px-5 py-2 text-sm font-medium text-slate-600 flex items-center h-[44px]">
                    {mortKg > 0 ? mortKg.toFixed(2) : "—"}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 flex items-center gap-1.5 mb-1">
                    <Scale size={16} className="text-slate-400" /> Wt (Del.)
                  </label>
                  <div className="w-full rounded-xl border border-slate-200 bg-slate-100/50 px-4 sm:px-5 py-2 text-sm font-medium text-slate-600 flex items-center h-[44px]">
                    {deliveredWeight > 0 ? deliveredWeight.toFixed(2) : "—"}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">Box</th>
                      <th className="px-3 py-2 text-left font-semibold">Birds (Temple)</th>
                      <th className="px-3 py-2 text-left font-semibold">Birds (Del.) <span className="text-rose-500">*</span></th>
                      <th className="px-3 py-2 text-left font-semibold">Wt (Temple)</th>
                      <th className="px-3 py-2 text-left font-semibold">Wt (Del.) <span className="text-rose-500">*</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {formData.perBoxData.map((item, index) => {
                      const farmBox = safeBoxDetails.find((b) => b.boxNo === item.boxNo);
                      const birdsError = validationErrors.perBoxBirdsErrors[index] || false;
                      const weightError = validationErrors.perBoxWeightErrors[index] || false;
                      return (
                        <tr key={item.boxNo} className="border-t border-slate-200">
                          <td className="px-3 py-2 font-medium">#{item.boxNo}</td>
                          <td className="px-3 py-2">{farmBox?.birds || 0}</td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              value={item.birds || ""}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                handlePerBoxChange(index, "birds", Number(e.target.value))
                              }
                              placeholder="0"
                              min="0"
                              className={`w-20 rounded border px-2 py-1 text-sm focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-500/10 outline-none transition-all no-spinner ${
                                birdsError ? "border-red-500 bg-red-50" : "border-slate-200 bg-slate-50/50"
                              }`}
                            />
                          </td>
                          <td className="px-3 py-2">{farmBox?.weight.toFixed(2) || "0.00"}</td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              step="0.01"
                              value={item.weight || ""}
                              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                handlePerBoxChange(index, "weight", Number(e.target.value))
                              }
                              placeholder="0.00"
                              min="0"
                              className={`w-24 rounded border px-2 py-1 text-sm focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-500/10 outline-none transition-all no-spinner ${
                                weightError ? "border-red-500 bg-red-50" : "border-slate-200 bg-slate-50/50"
                              }`}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Remarks */}
          <div>
            <label className="text-sm font-medium text-slate-700 flex items-center gap-1.5 mb-1">
              <MessageSquare size={16} className="text-slate-400" /> Remarks
            </label>
            <input
              value={formData.remarks || ""}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleFormChange("remarks", e.target.value)}
              placeholder="Optional notes..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 sm:px-5 py-2 text-sm font-medium text-slate-700 focus:bg-white focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all h-[44px]"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-slate-200">
            <button
              onClick={closeForm}
              className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium transition-colors touch-manipulation"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!isFormValid}
              className={`px-5 py-2.5 rounded-xl text-sm font-medium shadow-sm transition-colors active:scale-95 touch-manipulation ${
                isFormValid
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                  : "bg-slate-300 text-slate-500 cursor-not-allowed shadow-none"
              }`}
            >
              {editingId !== null ? "Update" : "Save"} Delivery
            </button>
          </div>
        </div>
      ) : (
        // ─── 3-COLUMN CARDS VIEW ───────────────────────────────────────────
        <>
          <div className="p-3 sm:p-4 bg-slate-50/40 rounded-2xl border border-slate-200/80">
            {currentRows.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-sm bg-white rounded-2xl border border-slate-200 border-dashed">
                <div className="flex flex-col items-center justify-center gap-2">
                  <div className="h-14 w-14 rounded-full bg-slate-50 flex items-center justify-center text-slate-300">
                    <AlertCircle className="w-6 h-6" />
                  </div>
                  <p className="font-medium text-slate-600">No shops added yet</p>
                  <p className="text-xs text-slate-400">
                    Click <span className="font-semibold text-emerald-600">Add Shop</span> to begin recording entries.
                  </p>
                </div>
              </div>
            ) : (
              /* Three Column Grid Layout */
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {currentRows.map((row: ShopDelivery) => {
                  return (
                    <div
                      key={row.id}
                      className="group bg-white border border-slate-200 rounded-2xl p-4 shadow-xs hover:shadow-md transition-all duration-300 flex flex-col justify-between"
                    >
                      {/* Top Row: Shop Name (Left) + Edit Pencil & PDF Icons (Right) */}
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 mb-2.5">
                        <div className="flex items-center gap-2 overflow-hidden">
                          <div className="h-6 w-6 rounded-full bg-emerald-500 flex items-center justify-center text-white shrink-0">
                            <Check size={14} />
                          </div>
                          <span className="font-semibold text-slate-800 text-sm truncate" title={row.shopName}>
                            {row.shopName}
                          </span>
                        </div>

                        {/* ✅ Edit Pencil & PDF Action Icons */}
                        <div className="flex items-center gap-1 shrink-0">
                          {!readOnly && (
                            <button
                              onClick={() => openEditForm(row)}
                              className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-600 transition-colors flex items-center gap-1 font-medium text-xs"
                              title="Edit"
                            >
                              <Pencil size={15} />
                            </button>
                          )}
                          <button
                            onClick={() => generatePDF(row as ShopDeliveryWithExtra)}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-red-600 transition-colors flex items-center gap-1 font-medium text-xs"
                            title="Download PDF"
                          >
                            <FileText size={15} />
                          </button>
                        </div>
                      </div>

                      {/* Middle Details: Boxes, Birds & Weight Underneath */}
                      <div className="flex items-center justify-between py-1 my-1">
                        {/* Boxes */}
                        <div className="flex items-center gap-1 text-slate-600 font-medium text-xs bg-slate-100 px-2.5 py-1 rounded-lg">
                          <Box size={14} className="text-slate-500" />
                          <span>{row.boxNo} Box{row.boxNo > 1 ? "es" : ""}</span>
                        </div>

                        {/* Birds */}
                        <div className="flex items-center gap-1 text-slate-800 font-semibold text-xs">
                          <Users size={14} className="text-blue-500" />
                          <span>{row.birds} Birds</span>
                        </div>

                        {/* Weight */}
                        <div className="flex items-center gap-1 text-slate-800 font-semibold text-xs">
                          <Scale size={14} className="text-emerald-500" />
                          <span>{row.weight.toFixed(2)} kg</span>
                        </div>
                      </div>

                      {/* Footer: Timestamp */}
                      <div className="flex items-center justify-between border-t border-slate-100 pt-2 mt-1 text-[11px] text-slate-400">
                        <div className="flex items-center gap-1">
                          <Clock size={12} />
                          <span>{(row as ShopDeliveryWithExtra).autoCaptureTime || "Just now"}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Pagination */}
          <div className="border-t border-slate-100 bg-white px-4 py-3 rounded-2xl border">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs font-medium text-slate-500">
                Page <span className="font-bold text-slate-700">{currentPage}</span> of{" "}
                <span className="font-bold text-slate-700">{Math.max(totalPages, 1)}</span>
                <span className="ml-2 text-[10px] text-slate-400">({itemsPerPage} per page)</span>
              </div>
              <TripPagination
                key={totalPages}
                currentPage={currentPage}
                totalPages={Math.max(totalPages, 1)}
                onPageChange={setCurrentPage}
                hidePageInfo={true}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default React.memo(UnLoadingTable);