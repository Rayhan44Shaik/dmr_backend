import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
// Local default: Database dmr_poultries @ localhost:5432 as user dmr
const DEFAULT_DATABASE_URL = "postgresql://dmr:dmr_local_dev@localhost:5432/dmr_poultries";
export function parseCorsOrigins(raw) {
    const value = raw ?? "http://localhost:5173";
    const entries = value.split(",").map((item) => item.trim());
    if (entries.some((item) => !item)) {
        throw new Error("Invalid CORS configuration: origins must not be empty.");
    }
    if (entries.includes("*")) {
        throw new Error("Invalid CORS configuration: wildcard origin is not allowed with credentials.");
    }
    for (const origin of entries) {
        let parsed;
        try {
            parsed = new URL(origin);
        }
        catch {
            throw new Error("Invalid CORS configuration: every origin must be an absolute HTTP(S) origin.");
        }
        if (!/^https?:$/.test(parsed.protocol) || parsed.origin !== origin || parsed.username || parsed.password) {
            throw new Error("Invalid CORS configuration: every origin must be an absolute HTTP(S) origin.");
        }
    }
    return [...new Set(entries)];
}
export const env = {
    port: Number(process.env.PORT ?? 4000),
    nodeEnv: process.env.NODE_ENV ?? "development",
    databaseUrl: process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
    corsOrigin: parseCorsOrigins(process.env.CORS_ORIGIN),
};
//# sourceMappingURL=env.js.map