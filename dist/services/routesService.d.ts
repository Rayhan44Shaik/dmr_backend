import type { Route } from "../types/models.js";
export declare function mapRoute(row: Record<string, unknown>): Route;
export declare const routesService: {
    listRoutes(): Promise<Route[]>;
    getRoute(id: number): Promise<Route>;
    assertUniqueName(routeName: string, excludeId?: number): Promise<void>;
    upsertRoute(body: Partial<Route> & {
        routeName: string;
    }): Promise<Route>;
    updateRouteStatus(id: number, status: Route["status"]): Promise<Route>;
    deleteRoute(id: number): Promise<{
        id: number;
        deleted: boolean;
        deactivated: boolean;
    }>;
};
