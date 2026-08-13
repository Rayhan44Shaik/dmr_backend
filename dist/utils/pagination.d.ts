export interface PaginationParams {
    page: number;
    limit: number;
    offset: number;
}
export interface PaginatedMeta {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}
export interface PaginatedResult<T> {
    data: T[];
    meta: PaginatedMeta;
}
export declare function parsePagination(query: {
    page?: unknown;
    limit?: unknown;
}): {
    params: PaginationParams | null;
    enabled: boolean;
};
export declare function paginatedResult<T>(data: T[], total: number, params: PaginationParams): PaginatedResult<T>;
