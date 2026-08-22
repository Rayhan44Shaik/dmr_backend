export function num(value, fallback = 0) {
    if (value === null || value === undefined || value === "")
        return fallback;
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}
export function numOrNull(value) {
    if (value === null || value === undefined || value === "")
        return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}
export function str(value, fallback = "") {
    if (value === null || value === undefined)
        return fallback;
    return String(value);
}
function pad2(n) {
    return n < 10 ? `0${n}` : String(n);
}
export function dateOnly(value) {
    if (!value)
        return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        // node-postgres parses `date` columns as JS Dates at LOCAL midnight, so
        // use local date components (not toISOString) to avoid a UTC off-by-one.
        return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
    }
    const s = String(value);
    if (/^\d{4}-\d{2}-\d{2}/.test(s))
        return s.slice(0, 10);
    const parsed = new Date(s);
    if (!Number.isNaN(parsed.getTime())) {
        return `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}-${pad2(parsed.getDate())}`;
    }
    return s.slice(0, 10);
}
export function isoOrNull(value) {
    if (!value)
        return null;
    return new Date(String(value)).toISOString();
}
//# sourceMappingURL=coerce.js.map