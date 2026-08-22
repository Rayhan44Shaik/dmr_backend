import { query, withTransaction } from "../config/db.js";
import { AppError } from "../middleware/errorHandler.js";
import { dateOnly, isoOrNull, num, str } from "../utils/coerce.js";
import { validateMarketRateFields } from "../utils/masterValidation.js";
/**
 * Market Rate master — one record per business date.
 * List is filtered by an optional [fromDate, toDate] range; saves are batched
 * and upserted by business_date so re-saving a date updates its single row.
 */
function mapMarketRate(row) {
    return {
        id: num(row.id),
        businessDate: dateOnly(row.business_date) ?? "",
        vij: num(row.vij),
        gun: num(row.gun),
        rp: num(row.rp),
        sneha: num(row.sneha),
        vencobRate: num(row.vencob_rate),
        vencobVii: num(row.vencob_vii),
        vencobGun: num(row.vencob_gun),
        associationVii: num(row.association_vii),
        c17: num(row.c17),
        c15: num(row.c15),
        c13: num(row.c13),
        c12: num(row.c12),
        c10: num(row.c10),
        createdAt: row.created_at ? isoOrNull(row.created_at) : null,
        updatedAt: row.updated_at ? isoOrNull(row.updated_at) : null,
    };
}
function bulkValidationFailed(errors) {
    throw new AppError(400, "Bulk market rate validation failed", { errors });
}
export const marketRatesService = {
    /** GET /api/masters/market-rates?fromDate=&toDate= */
    async listMarketRates(fromDate, toDate) {
        const result = await query(`SELECT * FROM market_rates
       WHERE ($1::date IS NULL OR business_date >= $1::date)
         AND ($2::date IS NULL OR business_date <= $2::date)
       ORDER BY business_date`, [fromDate || null, toDate || null]);
        return result.rows.map(mapMarketRate);
    },
    /**
     * PUT /api/masters/market-rates/batch — validates the whole batch first,
     * rejects duplicate dates within the batch (409), then upserts every row by
     * business_date in one transaction (re-saving a date updates its single row).
     */
    async upsertMarketRates(inputs) {
        if (!Array.isArray(inputs) || inputs.length === 0) {
            throw new AppError(400, "No market rate rows provided.");
        }
        const errors = [];
        inputs.forEach((raw, index) => {
            validateMarketRateFields(raw).forEach(({ field, message }) => errors.push({ row: index + 1, field, message }));
        });
        if (errors.length)
            bulkValidationFailed(errors);
        return withTransaction(async (client) => {
            const saved = [];
            const seenDates = new Set();
            for (const raw of inputs) {
                const businessDate = str(raw.businessDate ?? raw.business_date).trim();
                if (seenDates.has(businessDate)) {
                    throw new AppError(409, `Duplicate market rate row for ${businessDate} within the batch.`);
                }
                seenDates.add(businessDate);
                const result = await client.query(`INSERT INTO market_rates (
             business_date, vij, gun, rp, sneha, vencob_rate, vencob_vii,
             vencob_gun, association_vii, c17, c15, c13, c12, c10
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
           ON CONFLICT (business_date) DO UPDATE SET
             vij = EXCLUDED.vij,
             gun = EXCLUDED.gun,
             rp = EXCLUDED.rp,
             sneha = EXCLUDED.sneha,
             vencob_rate = EXCLUDED.vencob_rate,
             vencob_vii = EXCLUDED.vencob_vii,
             vencob_gun = EXCLUDED.vencob_gun,
             association_vii = EXCLUDED.association_vii,
             c17 = EXCLUDED.c17,
             c15 = EXCLUDED.c15,
             c13 = EXCLUDED.c13,
             c12 = EXCLUDED.c12,
             c10 = EXCLUDED.c10,
             updated_at = NOW()
           RETURNING *`, [
                    businessDate,
                    num(raw.vij ?? 0),
                    num(raw.gun ?? 0),
                    num(raw.rp ?? 0),
                    num(raw.sneha ?? 0),
                    num(raw.vencobRate ?? raw.vencob_rate ?? 0),
                    num(raw.vencobVii ?? raw.vencob_vii ?? 0),
                    num(raw.vencobGun ?? raw.vencob_gun ?? 0),
                    num(raw.associationVii ?? raw.association_vii ?? 0),
                    num(raw.c17 ?? 0),
                    num(raw.c15 ?? 0),
                    num(raw.c13 ?? 0),
                    num(raw.c12 ?? 0),
                    num(raw.c10 ?? 0),
                ]);
                saved.push(mapMarketRate(result.rows[0]));
            }
            return saved;
        });
    },
};
//# sourceMappingURL=marketRatesService.js.map