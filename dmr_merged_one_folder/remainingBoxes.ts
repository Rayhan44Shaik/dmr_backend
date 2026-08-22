import type { ShopDelivery, BoxDetail } from "../../types/trip";

const FULLY_CONSUMED = Number.MAX_SAFE_INTEGER;

export interface BoxRemaining extends BoxDetail {
  boxNo: number;
  birds: number;
  weight: number;
}

/** Consumption map keyed by boxNo — the single source of truth for which
 * boxes have been delivered. A row consumes boxes differently depending on
 * how it was captured:
 *   - per-box data (weight mode): consumes exactly the split per box.
 *   - box mode, single box: consumes birds + mortality and weight + mortKg.
 *   - box mode, multiple boxes (no per-box split): consumes the WHOLE box —
 *     the row takes the box's full remaining birds/weight, so the box can
 *     never be selected again.
 */
export function computeRemainingBoxes(
  _boxDetails: BoxDetail[],
  rows: ShopDelivery[],
  opts: { excludeRowId?: number | null } = {}
): Map<number, { birds: number; weight: number }> {
  const used = new Map<number, { birds: number; weight: number }>();
  const add = (boxNo: number, birds: number, weight: number) => {
    const cur = used.get(boxNo) ?? { birds: 0, weight: 0 };
    used.set(boxNo, { birds: cur.birds + birds, weight: cur.weight + weight });
  };
  rows.forEach((row) => {
    if (opts.excludeRowId != null && Number(row.id) === Number(opts.excludeRowId)) return;
    const extra = row as ShopDelivery & {
      perBoxData?: { boxNo: number; birds: number; weight: number }[];
      selectedBoxIds?: number[];
      mortKg?: number;
    };
    const per = Array.isArray(extra.perBoxData) ? extra.perBoxData : [];
    const selected: number[] = Array.isArray(extra.selectedBoxIds) ? extra.selectedBoxIds.map(Number) : [];
    if (per.length) {
      per.forEach((pb) => add(Number(pb.boxNo), Number(pb.birds || 0), Number(pb.weight || 0)));
    } else if (selected.length === 1) {
      add(
        selected[0],
        Number(row.birds || 0) + Number(row.mortality || 0),
        Number(row.weight || 0) + Number(extra.mortKg || 0)
      );
    } else {
      selected.forEach((id) => add(id, FULLY_CONSUMED, FULLY_CONSUMED));
    }
  });
  return used;
}

/** Pending (not-yet-delivered) boxes derived from live delivery rows. */
export function pendingBoxesFromRows(
  boxDetails: BoxDetail[],
  rows: ShopDelivery[],
  opts: { excludeRowId?: number | null } = {}
): BoxRemaining[] {
  const used = computeRemainingBoxes(boxDetails, rows, opts);
  return boxDetails
    .map((b) => {
      const boxNo = Number(b.boxNo);
      const consumed = used.get(boxNo) ?? { birds: 0, weight: 0 };
      const remainBirds = Math.max(0, Number(b.birds || 0) - consumed.birds);
      const remainWeight = Math.max(0, Number(b.weight || 0) - consumed.weight);
      return { ...b, boxNo, birds: remainBirds, weight: remainWeight } as BoxRemaining;
    })
    .filter((b) => b.birds > 0 || b.weight > 0);
}

/** Remaining map keyed by boxNo (mirrors `pendingBoxesFromRows` shape). */
export function remainingBoxesByNumber(
  boxDetails: BoxDetail[],
  rows: ShopDelivery[],
  opts: { excludeRowId?: number | null } = {}
): Map<number, { birds: number; weight: number }> {
  const used = computeRemainingBoxes(boxDetails, rows, opts);
  const remaining = new Map<number, { birds: number; weight: number }>();
  boxDetails.forEach((b) => {
    const boxNo = Number(b.boxNo);
    const consumed = used.get(boxNo) ?? { birds: 0, weight: 0 };
    remaining.set(boxNo, {
      birds: Math.max(0, Number(b.birds || 0) - consumed.birds),
      weight: Math.max(0, Number(b.weight || 0) - consumed.weight),
    });
  });
  return remaining;
}