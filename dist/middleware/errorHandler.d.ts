import type { NextFunction, Request, Response } from "express";
export declare class AppError extends Error {
    status: number;
    details?: unknown;
    code?: string;
    constructor(status: number, message: string, details?: unknown, code?: string);
}
export declare function notFound(_req: Request, res: Response): void;
export declare function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): Response<any, Record<string, any>>;
export declare function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): (req: Request, res: Response, next: NextFunction) => void;
