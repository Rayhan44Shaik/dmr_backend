const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
export function parsePagination(query) {
    const hasPage = query.page !== undefined && query.page !== "";
    const hasLimit = query.limit !== undefined && query.limit !== "";
    if (!hasPage && !hasLimit) {
        return { params: null, enabled: false };
    }
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number(query.limit) || DEFAULT_LIMIT));
    const offset = (page - 1) * limit;
    return {
        enabled: true,
        params: { page, limit, offset },
    };
}
export function paginatedResult(data, total, params) {
    return {
        data,
        meta: {
            total,
            page: params.page,
            limit: params.limit,
            totalPages: Math.max(1, Math.ceil(total / params.limit)),
        },
    };
}
//# sourceMappingURL=pagination.js.map