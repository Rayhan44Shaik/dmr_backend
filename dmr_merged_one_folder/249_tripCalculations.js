function round3(n) {
    return Math.round(n * 1000) / 1000;
}
function round4(n) {
    return Math.round(n * 10000) / 10000;
}
export function computeFarmAmount(farmLoadWeight, farmRate) {
    const weight = Number(farmLoadWeight ?? 0);
    const rate = Number(farmRate ?? 0);
    return Number((weight * rate).toFixed(2));
}
export function computeTotalKm(openingMeter, closingMeter, endMeter) {
    const open = Number(openingMeter ?? 0);
    const close = Number(closingMeter ?? endMeter ?? 0);
    if (!open || !close || close < open)
        return 0;
    return Number((close - open).toFixed(2));
}
export function computeDeliveryAmount(weight, rate) {
    return Number((weight * Number(rate ?? 0)).toFixed(2));
}
export function computeTripKpis(opts) {
    const boxes = opts.boxes ?? [];
    const deliveries = opts.deliveries ?? [];
    const farmBirdCount = Number(opts.farmBirdCount ?? opts.totalBirds ?? 0);
    const farmLoadWeight = Number(opts.farmLoadWeight ?? opts.dcWeight ?? boxes.reduce((s, b) => s + b.weight, 0));
    const totalWeight = round3(boxes.reduce((sum, b) => sum + Number(b.weight ?? 0), 0));
    const totalDeliveredWeight = round3(deliveries.reduce((sum, d) => sum + Number(d.weight ?? 0), 0));
    const totalBirdsDelivered = deliveries.reduce((sum, d) => sum + Number(d.birds ?? 0), 0);
    const totalMortalityCount = deliveries.reduce((sum, d) => sum + Number(d.mortality ?? 0), 0);
    const totalMortalityWeight = round3(deliveries.reduce((sum, d) => sum + Number(d.mortKg ?? 0), 0));
    const totalMortality = totalMortalityWeight;
    const weightLoss = round3(farmLoadWeight - totalDeliveredWeight - totalMortalityWeight);
    const survivalRate = farmBirdCount > 0 ? round4(totalBirdsDelivered / farmBirdCount) : 0;
    const totalShops = deliveries.length;
    const lastShop = deliveries.length > 0 ? deliveries[deliveries.length - 1].shopName || null : null;
    const enrichedDeliveries = deliveries.map((d) => ({
        ...d,
        amount: d.amount != null && d.amount > 0
            ? d.amount
            : computeDeliveryAmount(Number(d.weight ?? 0), d.rate),
    }));
    return {
        totalWeight: totalWeight || round3(farmLoadWeight),
        totalDeliveredWeight,
        totalBirdsDelivered,
        totalMortality,
        totalMortalityCount,
        totalMortalityWeight,
        weightLoss,
        survivalRate,
        totalShops,
        lastShop,
        deliveries: enrichedDeliveries,
        boxes: boxes.length,
        totalBirds: boxes.reduce((s, b) => s + Number(b.birds ?? 0), 0) || farmBirdCount,
        avgWeight: boxes.length > 0
            ? round3(totalWeight / boxes.reduce((s, b) => s + Number(b.birds ?? 0), 0) || 1)
            : farmBirdCount > 0
                ? round3(farmLoadWeight / farmBirdCount)
                : 0,
    };
}
export function sumDieselFuel(entries) {
    return Number(entries
        .reduce((sum, e) => sum + Number(e.litres ?? 0) * Number(e.rate ?? 0), 0)
        .toFixed(2));
}
//# sourceMappingURL=tripCalculations.js.map