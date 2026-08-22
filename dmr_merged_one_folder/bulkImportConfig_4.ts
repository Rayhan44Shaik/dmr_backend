/**
 * Shop bulk-import configuration.
 *
 * Uses the existing transactional POST /masters/shops/bulk endpoint
 * (addShopsBulk) with fields supported by the current Shop contract.
 */
import type { BulkImportConfig } from "../components/bulk-import/bulkImportTypes";
import type { Shop } from "./types/shop";
import type { ShopInput } from "./services/shopService";

export type ShopBulkRow = {
  shopName: string;
  ownerName: string;
  phoneNumber: string;
  email: string;
  village: string;
  address: string;
  status: "Active" | "Inactive";
};

function toShopPayload(row: ShopBulkRow): ShopInput {
  return {
    shopName: row.shopName.trim(),
    ownerName: row.ownerName.trim(),
    phoneNumber: row.phoneNumber.trim(),
    email: row.email.trim(),
    village: row.village.trim(),
    address: row.address.trim(),
    status: row.status,
    openingBalance: 0,
  };
}

function validateShopRow(row: ShopBulkRow, existing: Shop[]): string[] {
  const errors: string[] = [];
  const shopName = row.shopName.trim();
  const ownerName = row.ownerName.trim();
  const phoneNumber = row.phoneNumber.trim();
  const email = row.email.trim();
  const village = row.village.trim();

  if (!shopName) errors.push("Shop Name is required.");
  else if (shopName.length < 3) errors.push("Shop Name must contain at least 3 characters.");

  if (!ownerName) errors.push("Owner Name is required.");
  else if (ownerName.length < 3) errors.push("Owner Name must contain at least 3 characters.");

  if (!phoneNumber) errors.push("Mobile Number is required.");
  else if (!/^[0-9]{10}$/.test(phoneNumber)) errors.push("Mobile Number must be exactly 10 digits.");

  if (!email) errors.push("Email ID is required.");
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("Please enter a valid email address.");

  if (!village) errors.push("Village is required.");

  const duplicate = existing.some(
    (s) => s.shopName.trim().toLowerCase() === shopName.toLowerCase()
  );
  if (duplicate) errors.push("Shop Name already exists.");

  return errors;
}

type ShopBulkDeps = {
  /** Wraps the transactional POST /masters/shops/bulk endpoint. */
  addShopsBulk: (inputs: ShopInput[]) => Promise<unknown>;
  /** Re-fetch the shops list (hook's reload). */
  reload: () => Promise<unknown>;
};

/** Build the full Shop BulkImportConfig wired to the shops hook. */
export function buildShopBulkImportConfig({
  addShopsBulk,
  reload,
}: ShopBulkDeps): BulkImportConfig<ShopBulkRow, Shop> {
  return {
    title: "Bulk Import Shops",
    subtitle: "Upload shops in one batch",
    noun: "Shop",
    nounPlural: "Shops",
    filenamePrefix: "Shops",
    columns: [
      { key: "Shop Name", required: true, sample: "Ramesh Chicken Shop" },
      { key: "Owner Name", required: true, sample: "Ramesh Kumar" },
      { key: "Phone", aliases: ["Mobile Number", "Phone Number"], required: true, sample: "9876543210" },
      { key: "Email", aliases: ["Email ID", "email"], required: true, sample: "shop@example.com" },
      { key: "Village", required: true, sample: "Bhimavaram" },
      { key: "Address", sample: "Main Road, 2nd Lane" },
      { key: "Status", sample: "Active" },
    ],
    parseRow: (record) => {
      const status = String(record["Status"] ?? "Active").trim();
      return {
        shopName: String(record["Shop Name"] ?? "").trim(),
        ownerName: String(record["Owner Name"] ?? "").trim(),
        phoneNumber: String(record["Phone"] ?? "").trim(),
        email: String(record["Email"] ?? "").trim(),
        village: String(record["Village"] ?? "").trim(),
        address: String(record["Address"] ?? "").trim(),
        status: status === "Inactive" ? "Inactive" : "Active",
      };
    },
    validateRow: validateShopRow,
    duplicateKey: (row) => row.shopName,
    toPayload: toShopPayload,
    createMany: async (rows, onProgress) => {
      const total = rows.length;
      const payloads = rows.map((r) => toShopPayload(r.data));
      onProgress(0, total);
      try {
        await addShopsBulk(payloads);
        onProgress(total, total);
        return { total, attempted: total, imported: total, failed: 0, errors: [] };
      } catch (err) {
        onProgress(total, total);
        return {
          total,
          attempted: total,
          imported: 0,
          failed: total,
          errors: [{
            row: 0,
            message: err instanceof Error ? err.message : "Shop import failed.",
          }],
        };
      }
    },
    refresh: reload,
    errorToString: (err) =>
      err instanceof Error ? err.message : "Import failed. Please try again.",
  };
}