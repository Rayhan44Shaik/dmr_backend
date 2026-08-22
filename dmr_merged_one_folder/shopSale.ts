export interface ShopSale {

  id: string;

  /** Backend-authoritative Shop Sales number, e.g. TR-20260820-001-S001.
   * Never generated/derived in the frontend — the backend is the source.
   * Optional only so unrelated consumers (dashboard demo seed, collections)
   * that construct ShopSale objects without it keep compiling; the Shop
   * Sales API mapper always sets it from the backend. */
  saleNo?: string;

  tripId: string;

  tripNo: string | number;

  tripDate: string;

  shopNo?: string;

  shopId: string;

  shopName: string;

  birdType: string;

  totalBirds: number;

  totalWeight: number;

  rate: number | null;
amount: number;
  remark: string;

  status: "Pending" | "Completed";

  /**
   * Additive fields carrying the real backend numeric identifiers and
   * lock/window state, alongside the existing string-typed id/tripId/shopId
   * kept for UI/component compatibility (ShopSalesTable's internal state is
   * typed against the string ids). The API service is the only place that
   * should read these — never re-derive eligibility or immutability in a
   * component from anything other than what the backend returned.
   */
  numericId?: number;
  numericTripId?: number | null;
  numericShopId?: number | null;
  mortality?: number;
  birdTypeId?: number | null;
  /** Whether the backend currently allows editing/deleting this sale
   * (Rate Entry locked + within the 10-day window). Backend remains the
   * authority on every actual mutation — this is display-only. */
  editable?: boolean;
  windowExpiresAt?: string | null;
  /** Whether the original Trip was soft-deleted. Historical Shop Sales
   * must remain visible but are always locked/read-only. */
  tripDeleted?: boolean;
  /** Backend-authoritative, user-friendly reason a sale is not editable
   * (e.g. "Original trip no longer exists.", "Editing period has expired."). */
  lockReason?: string | null;
  /** Backend-authoritative Rate Entry lock / 10-day correction state. */
  rateCompleted?: boolean;
  rateLockedAt?: string | null;
  rateLockedBy?: string | null;
  correctionWindowExpired?: boolean;
  correctionWindowClosesAt?: string | null;

}

export interface ShopSaleSummary {

  totalBirds: number;

  totalShops: number;

  totalWeight: number;

  totalAmount: number;

  averageRate: number;

  averageWeightPerBird: number;

}

export interface ShopSaleFilter {

  fromDate: string;

  toDate: string;

  shopName: string;

  /** Free-text search sent to the backend — matches Shop Sales No,
   * Shop Name, Trip No and remarks (backend ILIKE). */
  search: string;

  /** One of: latest | oldest | shop_asc | shop_desc | amount_desc | amount_asc */
  sortBy: string;

}