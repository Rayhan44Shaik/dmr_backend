import type { MarketRate } from "../types/models.js";
export declare const marketRatesService: {
    /** GET /api/masters/market-rates?fromDate=&toDate= */
    listMarketRates(fromDate?: string, toDate?: string): Promise<MarketRate[]>;
    /**
     * PUT /api/masters/market-rates/batch — validates the whole batch first,
     * rejects duplicate dates within the batch (409), then upserts every row by
     * business_date in one transaction (re-saving a date updates its single row).
     */
    upsertMarketRates(inputs: Record<string, unknown>[]): Promise<MarketRate[]>;
};
