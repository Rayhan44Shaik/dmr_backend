import { z } from "zod";
import { AppError } from "../middleware/errorHandler.js";
import { MARKET_RATE_NUMERIC_FIELDS } from "../utils/masterValidation.js";

const trimmed = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) => trimmed(max).optional().default("");
const nullableDate = z.union([z.string().date(), z.literal(""), z.null()]).optional().transform((v) => v || null);
const activeStatus = z.enum(["Active", "Inactive"]);
const positiveId = z.coerce.number().int().positive();
const optionalPositiveNo = z.coerce.number().int().positive().optional();
const phone = z.string().trim().regex(/^\d{10}$/, "Phone number must be exactly 10 digits");
const optionalPhone = z.union([z.literal(""), phone]).optional().default("");
const email = z.union([z.literal(""), z.string().trim().email().max(200)]).optional().default("");

export const masterIdSchema = z.object({ id: positiveId });
export const masterStatusSchema = z.object({ status: activeStatus });
export const employeeStatusSchema = z.object({ status: z.enum(["Active", "Inactive", "Suspended"]) });

export const employeeSchema = z.object({
  employeeNo: optionalPositiveNo,
  employeeName: trimmed(200).min(1),
  department: trimmed(100).min(1),
  secondaryDepartment: trimmed(100).nullable().optional(),
  role: optionalText(100),
  phoneNumber: phone,
  email,
  address: optionalText(2000),
  joiningDate: nullableDate,
  aadharNumber: z.union([z.literal(""), z.string().trim().regex(/^\d{12}$/)]).nullable().optional(),
  licenseNumber: trimmed(50).nullable().optional(),
  salary: z.coerce.number().finite().min(0).max(100_000_000),
  status: z.enum(["Active", "Inactive", "Suspended"]).optional().default("Active"),
  avatar: trimmed(2_000_000).nullable().optional(),
}).strict();

export const vehicleSchema = z.object({
  vehicleNo: optionalPositiveNo,
  vehicleNumber: trimmed(50).min(1),
  vehicleType: trimmed(100).min(1),
  noOfBoxes: z.coerce.number().int().positive().max(100_000),
  birdCapacity: z.coerce.number().int().positive().max(10_000_000),
  capacityKg: z.coerce.number().positive().max(100_000_000),
  trackingId: optionalText(100),
  fastagBank: optionalText(100),
  engineNumber: trimmed(100).min(1),
  chassisNumber: trimmed(100).min(1),
  insuranceExpiry: nullableDate,
  permitExpiry: nullableDate,
  fitnessExpiry: nullableDate,
  purchaseDate: nullableDate,
  purchaseAmount: z.coerce.number().finite().min(0).max(1_000_000_000).nullable().optional(),
  emiStartDate: nullableDate,
  emiDay: z.coerce.number().int().min(1).max(31).nullable().optional(),
  totalEMIs: z.coerce.number().int().positive().max(1200).nullable().optional(),
  rcDate: nullableDate,
  status: activeStatus.optional().default("Active"),
}).strict();

export const farmSchema = z.object({
  farmNo: optionalPositiveNo,
  farmName: trimmed(200).min(1),
  ownerName: trimmed(200).min(3),
  supervisorName: trimmed(200).min(1),
  phoneNumber: phone,
  village: trimmed(200).min(1),
  address: optionalText(2000),
  capacity: z.coerce.number().int().positive().max(100_000_000),
  status: activeStatus.optional().default("Active"),
}).strict();

export const shopSchema = z.object({
  shopNo: optionalPositiveNo,
  shopNumber: optionalText(50),
  shopName: trimmed(200).min(3),
  ownerName: trimmed(200).min(3),
  phoneNumber: phone,
  secondaryPhoneNumber: optionalPhone,
  whatsappNumber: optionalPhone,
  email,
  city: trimmed(200).min(1),
  address: optionalText(2000),
  latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
  longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
  paperRate: z.coerce.number().int().min(1).max(30),
  associationType: z.enum(["Vencob Vij", "Vencob Gun", "Ass Vij", "Ass Gun"]),
  status: activeStatus.optional().default("Active"),
  openingBalance: z.coerce.number().finite().min(-1_000_000_000).max(1_000_000_000),
}).strict();

export const bankSchema = z.object({
  bankNo: optionalPositiveNo,
  bankName: trimmed(200).min(1),
  branch: trimmed(200).min(1),
  accountNumber: trimmed(50).min(1),
  ifscCode: z.string().trim().toUpperCase().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "IFSC code is invalid"),
  upiId: optionalText(100),
  status: activeStatus.optional().default("Active"),
}).strict();

export const birdTypeSchema = z.object({
  birdTypeNo: optionalPositiveNo,
  birdType: trimmed(100).min(1),
  category: z.enum(["Bird", "Fuel Bunk"]).optional().default("Bird"),
  averageWeight: z.coerce.number().min(0).max(1000),
  description: optionalText(2000),
  ownerName: optionalText(150),
  mobileNumber: optionalText(10),
  address: optionalText(1000),
  latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
  longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
  status: activeStatus.optional().default("Active"),
}).strict().superRefine((value, ctx) => {
  if (value.category === "Bird" && value.averageWeight <= 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["averageWeight"], message: "Average weight must be greater than zero" });
  }
  if (value.category === "Fuel Bunk") {
    if (!value.ownerName?.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["ownerName"], message: "Owner name is required" });
    if (!/^\d{10}$/.test(value.mobileNumber ?? "")) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["mobileNumber"], message: "Mobile number must be exactly 10 digits" });
    if (!value.address?.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["address"], message: "Bunk address is required" });
    if (value.latitude == null || value.longitude == null || (value.latitude === 0 && value.longitude === 0)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["latitude"], message: "Valid GPS coordinates are required" });
  }
});

export const routeSchema = z.object({
  routeNo: optionalPositiveNo,
  routeName: trimmed(200).min(1),
  routeCode: optionalText(50),
  description: optionalText(2000),
  status: activeStatus.optional().default("Active"),
}).strict();

const dateQuery = z.union([z.string().date(), z.literal("")]).optional();
export const marketRateQuerySchema = z.object({ fromDate: dateQuery, toDate: dateQuery }).strict()
  .refine((q) => !q.fromDate || !q.toDate || q.fromDate <= q.toDate, {
    message: "fromDate must not be after toDate",
  });

export const marketRateBatchSchema = z.array(z.object({
  businessDate: z.string().date(),
  ...Object.fromEntries(MARKET_RATE_NUMERIC_FIELDS.map(field => [field, z.coerce.number().finite().min(0).max(99999999).optional().default(0)])),
})).min(1).max(1000);

export const locationSchema = z.object({ input: z.string().trim().min(1).max(2000) }).strict();

/** Parse coordinates (and the place name, when present) from pasted text.
 * Never fetch user-supplied URLs (including redirects). */
export function resolveMasterLocation(input: string) {
  const decoded = (() => { try { return decodeURIComponent(input); } catch { return input; } })();
  // The exact place pin (!3dLat!4dLon) wins: the "@lat,lon" centre of a place
  // search URL is the viewport middle and can sit kilometres from the pin.
  const pin = decoded.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  const at = decoded.match(/(?:@|[?&](?:q|query|ll)=|^)(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)(?:[,/&\s]|$)/);
  if (!pin && !at) throw new AppError(400, "Paste latitude,longitude or a full Maps URL containing coordinates. Short links and address lookup are not supported; use GPS instead.");
  const latitude = Number((pin ?? at)![1]);
  const longitude = Number((pin ?? at)![2]);
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) throw new AppError(400, "Coordinates are outside the valid range.");
  // Place name from the /place/<Name>/ segment ("+" reads as a space here;
  // decode first so a genuine %2B stays a plus).
  let placeName: string | null = null;
  const place = decoded.match(/\/place\/([^/@?]+)/);
  if (place) {
    try {
      const name = decodeURIComponent(place[1]).replace(/\+/g, " ").trim();
      if (name) placeName = name;
    } catch {
      /* keep null */
    }
  }
  const plainCoords = /^\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*$/.test(decoded);
  return {
    latitude,
    longitude,
    address: null,
    placeName,
    mapsUrl: `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`,
    precision: pin || plainCoords ? "pin" : "viewport",
  };
}

export function parseMaster<T>(
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  input: unknown
): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  throw new AppError(400, "Validation failed", {
    errors: result.error.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    })),
  });
}
