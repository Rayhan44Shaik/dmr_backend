import type { Client } from "pg";
import { AppError } from "../middleware/errorHandler.js";
import type { BoxDetail } from "../types/models.js";
import { num, numOrNull, str } from "./coerce.js";

export function pickupBoxAvg(birds: number, weight: number): number | null {
  if (!(birds > 0) || !Number.isFinite(weight) || !(weight > 0)) return null;
  return Number((weight / birds).toFixed(3));
}

export function isActualImagePayload(data: unknown): boolean {
  if (typeof data !== "string") return false;
  const trimmed = data.trim();
  return trimmed.length >= 32 && /^data:image\//i.test(trimmed);
}

export async function loadVehicleBoxCapacity(
  client: Client,
  vehicleId: number | null
): Promise<number> {
  if (vehicleId == null || vehicleId <= 0) return 0;
  const veh = await client.query(`SELECT no_of_boxes FROM vehicles WHERE id = $1`, [vehicleId]);
  if (!veh.rowCount) return 0;
  return num(veh.rows[0].no_of_boxes);
}

export function assertPickupBoxNumbers(
  boxes: BoxDetail[],
  capacity: number,
  mode: "save" | "submit"
): void {
  const boxNos = boxes.map((b) => Number(b.boxNo));
  const seen = new Set<number>();
  for (const n of boxNos) {
    if (!Number.isInteger(n) || n <= 0) {
      throw new AppError(422, `Invalid box number: ${n}. Box numbers must be positive whole numbers.`);
    }
    if (seen.has(n)) {
      throw new AppError(422, `Duplicate box number: ${n}.`);
    }
    seen.add(n);
    if (capacity > 0 && n > capacity) {
      throw new AppError(422, `Vehicle box capacity exceeded. Maximum boxes for this vehicle: ${capacity}.`);
    }
  }
  if (capacity > 0 && boxes.length > capacity) {
    throw new AppError(422, `Vehicle box capacity exceeded. Maximum boxes for this vehicle: ${capacity}.`);
  }
  if (mode === "submit") {
    for (let i = 0; i < boxNos.length; i++) {
      if (boxNos[i] !== i + 1) {
        throw new AppError(
          422,
          boxNos[i] === boxNos[i - 1]
            ? `Duplicate box number: ${boxNos[i]}.`
            : "Box numbers must be sequential (1, 2, 3…)."
        );
      }
    }
    if (!boxes.length) {
      throw new AppError(422, "At least one box with birds and weight is required to submit Pickup.");
    }
    for (const b of boxes) {
      const birds = Number(b.birds ?? 0);
      const weight = Number(b.weight ?? 0);
      if (!Number.isInteger(birds) || birds <= 0) {
        throw new AppError(422, `Box ${b.boxNo} bird count must be a valid positive whole number.`);
      }
      if (!Number.isFinite(weight) || weight <= 0) {
        throw new AppError(422, `Box ${b.boxNo} weight must be a valid positive number.`);
      }
    }
  } else {
    for (const b of boxes) {
      const birds = b.birds == null ? 0 : Number(b.birds);
      const weight = b.weight == null ? 0 : Number(b.weight);
      if (b.birds != null && (!Number.isInteger(birds) || birds < 0)) {
        throw new AppError(422, `Box ${b.boxNo} bird count must be a valid non-negative whole number.`);
      }
      if (b.weight != null && (!Number.isFinite(weight) || weight < 0)) {
        throw new AppError(422, `Box ${b.boxNo} weight must be a valid non-negative number.`);
      }
    }
  }
}

export function assertSequentialBoxes(boxes: BoxDetail[]): void {
  const nos = [...boxes.map((b) => Number(b.boxNo))].sort((a, b) => a - b);
  for (let i = 0; i < nos.length; i++) {
    if (nos[i] !== i + 1) {
      throw new AppError(422, "Box numbers must be sequential (1, 2, 3…).");
    }
  }
}

async function insertBox(client: Client, tripId: number, box: BoxDetail): Promise<void> {
  const birds = Number(box.birds ?? 0);
  const weight = Number(box.weight ?? 0);
  const avgWeight = pickupBoxAvg(birds, weight);
  try {
    await client.query(
      `INSERT INTO trip_boxes (trip_id, box_no, birds, weight, avg_weight)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (trip_id, box_no) DO UPDATE
         SET birds = EXCLUDED.birds, weight = EXCLUDED.weight, avg_weight = EXCLUDED.avg_weight`,
      [tripId, box.boxNo, birds, weight, avgWeight]
    );
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code !== "42703") throw err;
    await client.query(
      `INSERT INTO trip_boxes (trip_id, box_no, birds, weight)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (trip_id, box_no) DO UPDATE
         SET birds = EXCLUDED.birds, weight = EXCLUDED.weight`,
      [tripId, box.boxNo, birds, weight]
    );
  }
}

export async function upsertPickupBoxes(client: Client, tripId: number, boxes: BoxDetail[]): Promise<void> {
  for (const box of boxes) {
    await insertBox(client, tripId, box);
  }
}

export async function replacePickupBoxes(client: Client, tripId: number, boxes: BoxDetail[]): Promise<void> {
  await client.query(`DELETE FROM trip_boxes WHERE trip_id = $1`, [tripId]);
  for (const box of boxes) {
    await insertBox(client, tripId, box);
  }
}

export async function removePickupBoxes(client: Client, tripId: number, boxNos: number[]): Promise<void> {
  if (!boxNos.length) return;
  await client.query(`DELETE FROM trip_boxes WHERE trip_id = $1 AND box_no = ANY($2::int[])`, [
    tripId,
    boxNos,
  ]);
}

export async function loadPickupBoxes(client: Client, tripId: number): Promise<BoxDetail[]> {
  const boxes = await client.query(
    `SELECT * FROM trip_boxes WHERE trip_id = $1 ORDER BY box_no`,
    [tripId]
  );
  return boxes.rows.map((r) => {
    const birds = num(r.birds);
    const weight = num(r.weight);
    return {
      boxNo: num(r.box_no),
      birds,
      weight,
      avgWeight: numOrNull(r.avg_weight) ?? pickupBoxAvg(birds, weight),
    };
  });
}

export async function recalcPickupTotals(client: Client, tripId: number): Promise<BoxDetail[]> {
  const boxes = await loadPickupBoxes(client, tripId);
  assertSequentialBoxes(boxes);
  const totalBirds = boxes.reduce((s, b) => s + Number(b.birds ?? 0), 0);
  const totalWeight = boxes.reduce((s, b) => s + Number(b.weight ?? 0), 0);
  const avg = pickupBoxAvg(totalBirds, totalWeight) ?? 0;
  await client.query(
    `UPDATE trips SET
       total_birds = $2,
       dc_weight = $3,
       boxes = $4,
       avg_weight = $5,
       total_weight = $3
     WHERE id = $1`,
    [tripId, totalBirds, totalWeight, boxes.length, avg]
  );
  return boxes;
}

export async function persistPickupPhotos(
  client: Client,
  tripId: number,
  body: Record<string, unknown>,
  sync: boolean
): Promise<number> {
  const persist = async (key: unknown, mime: unknown, data: unknown) => {
    if (key && isActualImagePayload(data)) {
      await client.query(
        `INSERT INTO trip_media (trip_id, media_key, media_type, mime_type, data_base64)
         VALUES ($1,$2,'image',$3,$4)
         ON CONFLICT (trip_id, media_key) DO UPDATE
           SET data_base64 = EXCLUDED.data_base64, mime_type = EXCLUDED.mime_type`,
        [tripId, str(key), mime ? str(mime) : "image/jpeg", str(data)]
      );
    }
  };
  await persist(body.dcPhotoKey, body.dcPhotoMime, body.dcPhotoData);
  await persist(body.dcPhotoKey2, body.dcPhotoMime2, body.dcPhotoData2);

  if (sync) {
    const keep: string[] = [];
    if (body.dcPhotoKey) keep.push(str(body.dcPhotoKey));
    if (body.dcPhotoKey2) keep.push(str(body.dcPhotoKey2));
    if (keep.length === 0) {
      await client.query(`DELETE FROM trip_media WHERE trip_id = $1 AND media_type = 'image'`, [tripId]);
    } else {
      await client.query(
        `DELETE FROM trip_media
          WHERE trip_id = $1 AND media_type = 'image'
            AND media_key <> ALL($2::text[])`,
        [tripId, keep]
      );
    }
    await client.query(`UPDATE trips SET dc_photo_key = $2 WHERE id = $1`, [
      tripId,
      keep[0] ?? null,
    ]);
  }

  const stored = await client.query(
    `SELECT data_base64 FROM trip_media WHERE trip_id = $1 AND media_type = 'image'`,
    [tripId]
  );
  return stored.rows.filter((r) => isActualImagePayload(r.data_base64)).length;
}
