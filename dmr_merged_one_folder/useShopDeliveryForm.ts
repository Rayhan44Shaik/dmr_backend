import { useState, useMemo, useCallback, useEffect } from "react";
import type { ShopDelivery, BoxDetail } from "../../types/trip";
import { remainingBoxesByNumber } from "./remainingBoxes";

export type ShopDeliveryWithExtra = ShopDelivery & {
  deliveryMode?: string;
  selectedBoxIds?: number[];
  farmBirds?: number;
  farmWeight?: number;
  mortKg?: number;
  perBoxData?: { boxNo: number; birds: number; weight: number }[];
  autoCaptureTime?: string;
};

export type ValidationErrors = {
  birdsExceed: boolean;
  birdsMismatch: boolean;
  weightMismatch: boolean;
  birdsExceedFarm: boolean;
  weightExceedFarm: boolean;
  perBoxBirdsErrors: boolean[];
  perBoxWeightErrors: boolean[];
};

export type ShopDeliveryFormState = {
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
};

export const EMPTY_DELIVERY_FORM: ShopDeliveryFormState = {
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
};

type ValidationInput = {
  mode: "box" | "weight";
  formData: ShopDeliveryFormState;
  farmBirds: number;
  farmWeight: number;
  weightModeTotals: { birds: number; weight: number };
  mortKg: number;
  availableBoxDetails: BoxDetail[];
};

/**
 * Pure, derived validation. Everything is recomputed from the CURRENT form
 * state on every render — never a stale boolean that survives after the user
 * corrects a value. Business rules preserved:
 *  - box mode: mortality cannot exceed the farm birds of the selected boxes.
 *  - weight mode: delivered+mortality birds must match farm birds exactly;
 *    delivered+mortality weight may not exceed farm weight (weight loss ok);
 *    each per-box value cannot exceed that box's remaining birds/weight.
 */
export function computeValidationErrors(input: ValidationInput): ValidationErrors {
  const { mode, formData, farmBirds, farmWeight, weightModeTotals, mortKg, availableBoxDetails } = input;

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

  return {
    birdsExceed,
    birdsMismatch,
    weightMismatch,
    birdsExceedFarm,
    weightExceedFarm,
    perBoxBirdsErrors,
    perBoxWeightErrors,
  };
}

export function validationIsValid(errors: ValidationErrors): boolean {
  return (
    !errors.birdsExceed &&
    !errors.birdsMismatch &&
    !errors.weightMismatch &&
    !errors.birdsExceedFarm &&
    !errors.weightExceedFarm &&
    !errors.perBoxBirdsErrors.some((err) => err) &&
    !errors.perBoxWeightErrors.some((err) => err)
  );
}

export function useShopDeliveryForm(
  safeRows: ShopDelivery[],
  safeBoxDetails: BoxDetail[],
  editingId: number | null
) {
  const [mode, setMode] = useState<"box" | "weight">("box");
  const [formData, setFormData] = useState<ShopDeliveryFormState>(EMPTY_DELIVERY_FORM);

  const remainingByBox = useMemo(
    () =>
      remainingBoxesByNumber(
        safeBoxDetails,
        safeRows,
        editingId != null ? { excludeRowId: editingId } : {}
      ),
    [safeRows, safeBoxDetails, editingId]
  );

  // Fully consumed boxes cannot be selected again (pending remaining stays selectable).
  const usedBoxIds = useMemo<number[]>(() => {
    const used: number[] = [];
    remainingByBox.forEach((remain, boxNo) => {
      if (remain.birds <= 0 && remain.weight <= 0) used.push(boxNo);
    });
    return used;
  }, [remainingByBox]);

  const availableBoxDetails = useMemo<BoxDetail[]>(() => {
    return safeBoxDetails
      .map((b: BoxDetail) => {
        const remain = remainingByBox.get(b.boxNo) ?? { birds: b.birds, weight: b.weight };
        return { ...b, birds: remain.birds, weight: remain.weight };
      })
      .filter(
        (b: BoxDetail) => !usedBoxIds.includes(b.boxNo) || formData.selectedBoxIds.includes(b.boxNo)
      );
  }, [safeBoxDetails, usedBoxIds, formData.selectedBoxIds, remainingByBox]);

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

  // ─── Weight Loss ──────────────────────────────────────────────
  const weightLoss = useMemo<number>(() => {
    if (mode !== "weight") return 0;
    const totalDeliveredWeight = weightModeTotals.weight;
    const totalMortalityWeight = formData.mortWeight || 0;
    return Math.max(0, farmWeight - (totalDeliveredWeight + totalMortalityWeight));
  }, [mode, farmWeight, weightModeTotals.weight, formData.mortWeight]);

  // ─── Derived validation (live — recomputed from current state) ──
  const validationErrors = useMemo<ValidationErrors>(
    () =>
      computeValidationErrors({
        mode,
        formData,
        farmBirds,
        farmWeight,
        weightModeTotals,
        mortKg,
        availableBoxDetails,
      }),
    [mode, formData, farmBirds, farmWeight, weightModeTotals, mortKg, availableBoxDetails]
  );

  const isValid = useMemo(() => validationIsValid(validationErrors), [validationErrors]);

  // Kept for API compatibility: returns the CURRENT derived validity without
  // mutating any state — there is no stale validation to clear anymore.
  const validate = useCallback((): boolean => isValid, [isValid]);

  // ─── Auto-initialise perBoxData when switching to weight mode ──
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.selectedBoxIds, mode]);

  return {
    mode,
    setMode,
    formData,
    setFormData,
    validationErrors,
    usedBoxIds,
    availableBoxDetails,
    farmBirds,
    farmWeight,
    boxCount,
    weightModeTotals,
    mortKg,
    deliveredBirds,
    deliveredWeight,
    weightLoss,
    validate,
  };
}
