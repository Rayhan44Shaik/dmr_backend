import type { Route } from "../types/models.js";
export declare const routesService: {
    listRoutes(): Promise<Route[]>;
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
