import pg from "pg";
export declare const pool: import("pg").Pool;
export declare function query<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params?: unknown[]): Promise<import("pg").QueryResult<T>>;
export declare function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T>;
