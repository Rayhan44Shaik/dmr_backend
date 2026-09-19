import { z } from "zod";
import type { TripWizardStep } from "../utils/tripResume.js";
export declare const tripAutosaveSchema: z.ZodObject<{
    tripDate: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    tripNo: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<["Draft", "Pending", "Completed", "Deleted"]>>;
    updatedAt: z.ZodOptional<z.ZodString>;
    expectedUpdatedAt: z.ZodOptional<z.ZodString>;
    vehicleId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    driverId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    supervisorId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    sourceFarmId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    farmBirdTypeId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    helpers: z.ZodOptional<z.ZodEffects<z.ZodArray<z.ZodString, "many">, string[], string[]>>;
    loaders: z.ZodOptional<z.ZodEffects<z.ZodArray<z.ZodString, "many">, string[], string[]>>;
    boxDetails: z.ZodOptional<z.ZodArray<z.ZodObject<{
        boxNo: z.ZodNumber;
        birds: z.ZodOptional<z.ZodNumber>;
        weight: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        boxNo: number;
        weight?: number | undefined;
        birds?: number | undefined;
    }, {
        boxNo: number;
        weight?: number | undefined;
        birds?: number | undefined;
    }>, "many">>;
    deliveries: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodOptional<z.ZodNumber>;
        serialNo: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        boxNo: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        shopId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        shopName: z.ZodOptional<z.ZodString>;
        birdTypeId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        birdType: z.ZodOptional<z.ZodString>;
        birds: z.ZodOptional<z.ZodNumber>;
        weight: z.ZodOptional<z.ZodNumber>;
        mortality: z.ZodOptional<z.ZodNumber>;
        mortKg: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        rate: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        amount: z.ZodOptional<z.ZodNumber>;
        remarks: z.ZodOptional<z.ZodString>;
        deliveryMode: z.ZodOptional<z.ZodEnum<["box", "weight"]>>;
        selectedBoxIds: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
        farmBirds: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        farmWeight: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        perBoxData: z.ZodOptional<z.ZodArray<z.ZodObject<{
            boxNo: z.ZodNumber;
            birds: z.ZodOptional<z.ZodNumber>;
            weight: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            boxNo: number;
            weight?: number | undefined;
            birds?: number | undefined;
        }, {
            boxNo: number;
            weight?: number | undefined;
            birds?: number | undefined;
        }>, "many">>;
        autoCaptureTime: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        id?: number | undefined;
        shopName?: string | undefined;
        birdType?: string | undefined;
        weight?: number | undefined;
        birds?: number | undefined;
        shopId?: number | null | undefined;
        birdTypeId?: number | null | undefined;
        rate?: number | null | undefined;
        remarks?: string | undefined;
        amount?: number | undefined;
        mortality?: number | undefined;
        boxNo?: number | null | undefined;
        autoCaptureTime?: string | null | undefined;
        selectedBoxIds?: number[] | undefined;
        serialNo?: number | null | undefined;
        mortKg?: number | null | undefined;
        deliveryMode?: "box" | "weight" | undefined;
        farmBirds?: number | null | undefined;
        farmWeight?: number | null | undefined;
        perBoxData?: {
            boxNo: number;
            weight?: number | undefined;
            birds?: number | undefined;
        }[] | undefined;
    }, {
        id?: number | undefined;
        shopName?: string | undefined;
        birdType?: string | undefined;
        weight?: number | undefined;
        birds?: number | undefined;
        shopId?: number | null | undefined;
        birdTypeId?: number | null | undefined;
        rate?: number | null | undefined;
        remarks?: string | undefined;
        amount?: number | undefined;
        mortality?: number | undefined;
        boxNo?: number | null | undefined;
        autoCaptureTime?: string | null | undefined;
        selectedBoxIds?: number[] | undefined;
        serialNo?: number | null | undefined;
        mortKg?: number | null | undefined;
        deliveryMode?: "box" | "weight" | undefined;
        farmBirds?: number | null | undefined;
        farmWeight?: number | null | undefined;
        perBoxData?: {
            boxNo: number;
            weight?: number | undefined;
            birds?: number | undefined;
        }[] | undefined;
    }>, "many">>;
    dieselEntries: z.ZodOptional<z.ZodArray<z.ZodObject<{
        rowIndex: z.ZodNumber;
        litres: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        rate: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        meter: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        bunkName: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        bunkGps: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        imageData: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        imageName: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        rowIndex: number;
        meter?: number | null | undefined;
        rate?: number | null | undefined;
        imageData?: string | null | undefined;
        imageName?: string | null | undefined;
        litres?: number | null | undefined;
        bunkName?: string | null | undefined;
        bunkGps?: string | null | undefined;
    }, {
        rowIndex: number;
        meter?: number | null | undefined;
        rate?: number | null | undefined;
        imageData?: string | null | undefined;
        imageName?: string | null | undefined;
        litres?: number | null | undefined;
        bunkName?: string | null | undefined;
        bunkGps?: string | null | undefined;
    }>, "many">>;
}, "passthrough", z.ZodTypeAny, z.objectOutputType<{
    tripDate: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    tripNo: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<["Draft", "Pending", "Completed", "Deleted"]>>;
    updatedAt: z.ZodOptional<z.ZodString>;
    expectedUpdatedAt: z.ZodOptional<z.ZodString>;
    vehicleId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    driverId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    supervisorId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    sourceFarmId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    farmBirdTypeId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    helpers: z.ZodOptional<z.ZodEffects<z.ZodArray<z.ZodString, "many">, string[], string[]>>;
    loaders: z.ZodOptional<z.ZodEffects<z.ZodArray<z.ZodString, "many">, string[], string[]>>;
    boxDetails: z.ZodOptional<z.ZodArray<z.ZodObject<{
        boxNo: z.ZodNumber;
        birds: z.ZodOptional<z.ZodNumber>;
        weight: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        boxNo: number;
        weight?: number | undefined;
        birds?: number | undefined;
    }, {
        boxNo: number;
        weight?: number | undefined;
        birds?: number | undefined;
    }>, "many">>;
    deliveries: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodOptional<z.ZodNumber>;
        serialNo: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        boxNo: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        shopId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        shopName: z.ZodOptional<z.ZodString>;
        birdTypeId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        birdType: z.ZodOptional<z.ZodString>;
        birds: z.ZodOptional<z.ZodNumber>;
        weight: z.ZodOptional<z.ZodNumber>;
        mortality: z.ZodOptional<z.ZodNumber>;
        mortKg: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        rate: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        amount: z.ZodOptional<z.ZodNumber>;
        remarks: z.ZodOptional<z.ZodString>;
        deliveryMode: z.ZodOptional<z.ZodEnum<["box", "weight"]>>;
        selectedBoxIds: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
        farmBirds: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        farmWeight: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        perBoxData: z.ZodOptional<z.ZodArray<z.ZodObject<{
            boxNo: z.ZodNumber;
            birds: z.ZodOptional<z.ZodNumber>;
            weight: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            boxNo: number;
            weight?: number | undefined;
            birds?: number | undefined;
        }, {
            boxNo: number;
            weight?: number | undefined;
            birds?: number | undefined;
        }>, "many">>;
        autoCaptureTime: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        id?: number | undefined;
        shopName?: string | undefined;
        birdType?: string | undefined;
        weight?: number | undefined;
        birds?: number | undefined;
        shopId?: number | null | undefined;
        birdTypeId?: number | null | undefined;
        rate?: number | null | undefined;
        remarks?: string | undefined;
        amount?: number | undefined;
        mortality?: number | undefined;
        boxNo?: number | null | undefined;
        autoCaptureTime?: string | null | undefined;
        selectedBoxIds?: number[] | undefined;
        serialNo?: number | null | undefined;
        mortKg?: number | null | undefined;
        deliveryMode?: "box" | "weight" | undefined;
        farmBirds?: number | null | undefined;
        farmWeight?: number | null | undefined;
        perBoxData?: {
            boxNo: number;
            weight?: number | undefined;
            birds?: number | undefined;
        }[] | undefined;
    }, {
        id?: number | undefined;
        shopName?: string | undefined;
        birdType?: string | undefined;
        weight?: number | undefined;
        birds?: number | undefined;
        shopId?: number | null | undefined;
        birdTypeId?: number | null | undefined;
        rate?: number | null | undefined;
        remarks?: string | undefined;
        amount?: number | undefined;
        mortality?: number | undefined;
        boxNo?: number | null | undefined;
        autoCaptureTime?: string | null | undefined;
        selectedBoxIds?: number[] | undefined;
        serialNo?: number | null | undefined;
        mortKg?: number | null | undefined;
        deliveryMode?: "box" | "weight" | undefined;
        farmBirds?: number | null | undefined;
        farmWeight?: number | null | undefined;
        perBoxData?: {
            boxNo: number;
            weight?: number | undefined;
            birds?: number | undefined;
        }[] | undefined;
    }>, "many">>;
    dieselEntries: z.ZodOptional<z.ZodArray<z.ZodObject<{
        rowIndex: z.ZodNumber;
        litres: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        rate: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        meter: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        bunkName: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        bunkGps: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        imageData: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        imageName: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        rowIndex: number;
        meter?: number | null | undefined;
        rate?: number | null | undefined;
        imageData?: string | null | undefined;
        imageName?: string | null | undefined;
        litres?: number | null | undefined;
        bunkName?: string | null | undefined;
        bunkGps?: string | null | undefined;
    }, {
        rowIndex: number;
        meter?: number | null | undefined;
        rate?: number | null | undefined;
        imageData?: string | null | undefined;
        imageName?: string | null | undefined;
        litres?: number | null | undefined;
        bunkName?: string | null | undefined;
        bunkGps?: string | null | undefined;
    }>, "many">>;
}, z.ZodTypeAny, "passthrough">, z.objectInputType<{
    tripDate: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    tripNo: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<["Draft", "Pending", "Completed", "Deleted"]>>;
    updatedAt: z.ZodOptional<z.ZodString>;
    expectedUpdatedAt: z.ZodOptional<z.ZodString>;
    vehicleId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    driverId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    supervisorId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    sourceFarmId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    farmBirdTypeId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    helpers: z.ZodOptional<z.ZodEffects<z.ZodArray<z.ZodString, "many">, string[], string[]>>;
    loaders: z.ZodOptional<z.ZodEffects<z.ZodArray<z.ZodString, "many">, string[], string[]>>;
    boxDetails: z.ZodOptional<z.ZodArray<z.ZodObject<{
        boxNo: z.ZodNumber;
        birds: z.ZodOptional<z.ZodNumber>;
        weight: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        boxNo: number;
        weight?: number | undefined;
        birds?: number | undefined;
    }, {
        boxNo: number;
        weight?: number | undefined;
        birds?: number | undefined;
    }>, "many">>;
    deliveries: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodOptional<z.ZodNumber>;
        serialNo: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        boxNo: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        shopId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        shopName: z.ZodOptional<z.ZodString>;
        birdTypeId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        birdType: z.ZodOptional<z.ZodString>;
        birds: z.ZodOptional<z.ZodNumber>;
        weight: z.ZodOptional<z.ZodNumber>;
        mortality: z.ZodOptional<z.ZodNumber>;
        mortKg: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        rate: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        amount: z.ZodOptional<z.ZodNumber>;
        remarks: z.ZodOptional<z.ZodString>;
        deliveryMode: z.ZodOptional<z.ZodEnum<["box", "weight"]>>;
        selectedBoxIds: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
        farmBirds: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        farmWeight: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        perBoxData: z.ZodOptional<z.ZodArray<z.ZodObject<{
            boxNo: z.ZodNumber;
            birds: z.ZodOptional<z.ZodNumber>;
            weight: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            boxNo: number;
            weight?: number | undefined;
            birds?: number | undefined;
        }, {
            boxNo: number;
            weight?: number | undefined;
            birds?: number | undefined;
        }>, "many">>;
        autoCaptureTime: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        id?: number | undefined;
        shopName?: string | undefined;
        birdType?: string | undefined;
        weight?: number | undefined;
        birds?: number | undefined;
        shopId?: number | null | undefined;
        birdTypeId?: number | null | undefined;
        rate?: number | null | undefined;
        remarks?: string | undefined;
        amount?: number | undefined;
        mortality?: number | undefined;
        boxNo?: number | null | undefined;
        autoCaptureTime?: string | null | undefined;
        selectedBoxIds?: number[] | undefined;
        serialNo?: number | null | undefined;
        mortKg?: number | null | undefined;
        deliveryMode?: "box" | "weight" | undefined;
        farmBirds?: number | null | undefined;
        farmWeight?: number | null | undefined;
        perBoxData?: {
            boxNo: number;
            weight?: number | undefined;
            birds?: number | undefined;
        }[] | undefined;
    }, {
        id?: number | undefined;
        shopName?: string | undefined;
        birdType?: string | undefined;
        weight?: number | undefined;
        birds?: number | undefined;
        shopId?: number | null | undefined;
        birdTypeId?: number | null | undefined;
        rate?: number | null | undefined;
        remarks?: string | undefined;
        amount?: number | undefined;
        mortality?: number | undefined;
        boxNo?: number | null | undefined;
        autoCaptureTime?: string | null | undefined;
        selectedBoxIds?: number[] | undefined;
        serialNo?: number | null | undefined;
        mortKg?: number | null | undefined;
        deliveryMode?: "box" | "weight" | undefined;
        farmBirds?: number | null | undefined;
        farmWeight?: number | null | undefined;
        perBoxData?: {
            boxNo: number;
            weight?: number | undefined;
            birds?: number | undefined;
        }[] | undefined;
    }>, "many">>;
    dieselEntries: z.ZodOptional<z.ZodArray<z.ZodObject<{
        rowIndex: z.ZodNumber;
        litres: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        rate: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        meter: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        bunkName: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        bunkGps: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        imageData: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        imageName: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        rowIndex: number;
        meter?: number | null | undefined;
        rate?: number | null | undefined;
        imageData?: string | null | undefined;
        imageName?: string | null | undefined;
        litres?: number | null | undefined;
        bunkName?: string | null | undefined;
        bunkGps?: string | null | undefined;
    }, {
        rowIndex: number;
        meter?: number | null | undefined;
        rate?: number | null | undefined;
        imageData?: string | null | undefined;
        imageName?: string | null | undefined;
        litres?: number | null | undefined;
        bunkName?: string | null | undefined;
        bunkGps?: string | null | undefined;
    }>, "many">>;
}, z.ZodTypeAny, "passthrough">>;
export declare function parseTripAutosave(body: unknown): z.objectOutputType<{
    tripDate: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    tripNo: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<["Draft", "Pending", "Completed", "Deleted"]>>;
    updatedAt: z.ZodOptional<z.ZodString>;
    expectedUpdatedAt: z.ZodOptional<z.ZodString>;
    vehicleId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    driverId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    supervisorId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    sourceFarmId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    farmBirdTypeId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    helpers: z.ZodOptional<z.ZodEffects<z.ZodArray<z.ZodString, "many">, string[], string[]>>;
    loaders: z.ZodOptional<z.ZodEffects<z.ZodArray<z.ZodString, "many">, string[], string[]>>;
    boxDetails: z.ZodOptional<z.ZodArray<z.ZodObject<{
        boxNo: z.ZodNumber;
        birds: z.ZodOptional<z.ZodNumber>;
        weight: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        boxNo: number;
        weight?: number | undefined;
        birds?: number | undefined;
    }, {
        boxNo: number;
        weight?: number | undefined;
        birds?: number | undefined;
    }>, "many">>;
    deliveries: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodOptional<z.ZodNumber>;
        serialNo: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        boxNo: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        shopId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        shopName: z.ZodOptional<z.ZodString>;
        birdTypeId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        birdType: z.ZodOptional<z.ZodString>;
        birds: z.ZodOptional<z.ZodNumber>;
        weight: z.ZodOptional<z.ZodNumber>;
        mortality: z.ZodOptional<z.ZodNumber>;
        mortKg: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        rate: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        amount: z.ZodOptional<z.ZodNumber>;
        remarks: z.ZodOptional<z.ZodString>;
        deliveryMode: z.ZodOptional<z.ZodEnum<["box", "weight"]>>;
        selectedBoxIds: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
        farmBirds: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        farmWeight: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        perBoxData: z.ZodOptional<z.ZodArray<z.ZodObject<{
            boxNo: z.ZodNumber;
            birds: z.ZodOptional<z.ZodNumber>;
            weight: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            boxNo: number;
            weight?: number | undefined;
            birds?: number | undefined;
        }, {
            boxNo: number;
            weight?: number | undefined;
            birds?: number | undefined;
        }>, "many">>;
        autoCaptureTime: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        id?: number | undefined;
        shopName?: string | undefined;
        birdType?: string | undefined;
        weight?: number | undefined;
        birds?: number | undefined;
        shopId?: number | null | undefined;
        birdTypeId?: number | null | undefined;
        rate?: number | null | undefined;
        remarks?: string | undefined;
        amount?: number | undefined;
        mortality?: number | undefined;
        boxNo?: number | null | undefined;
        autoCaptureTime?: string | null | undefined;
        selectedBoxIds?: number[] | undefined;
        serialNo?: number | null | undefined;
        mortKg?: number | null | undefined;
        deliveryMode?: "box" | "weight" | undefined;
        farmBirds?: number | null | undefined;
        farmWeight?: number | null | undefined;
        perBoxData?: {
            boxNo: number;
            weight?: number | undefined;
            birds?: number | undefined;
        }[] | undefined;
    }, {
        id?: number | undefined;
        shopName?: string | undefined;
        birdType?: string | undefined;
        weight?: number | undefined;
        birds?: number | undefined;
        shopId?: number | null | undefined;
        birdTypeId?: number | null | undefined;
        rate?: number | null | undefined;
        remarks?: string | undefined;
        amount?: number | undefined;
        mortality?: number | undefined;
        boxNo?: number | null | undefined;
        autoCaptureTime?: string | null | undefined;
        selectedBoxIds?: number[] | undefined;
        serialNo?: number | null | undefined;
        mortKg?: number | null | undefined;
        deliveryMode?: "box" | "weight" | undefined;
        farmBirds?: number | null | undefined;
        farmWeight?: number | null | undefined;
        perBoxData?: {
            boxNo: number;
            weight?: number | undefined;
            birds?: number | undefined;
        }[] | undefined;
    }>, "many">>;
    dieselEntries: z.ZodOptional<z.ZodArray<z.ZodObject<{
        rowIndex: z.ZodNumber;
        litres: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        rate: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        meter: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
        bunkName: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        bunkGps: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        imageData: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        imageName: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        rowIndex: number;
        meter?: number | null | undefined;
        rate?: number | null | undefined;
        imageData?: string | null | undefined;
        imageName?: string | null | undefined;
        litres?: number | null | undefined;
        bunkName?: string | null | undefined;
        bunkGps?: string | null | undefined;
    }, {
        rowIndex: number;
        meter?: number | null | undefined;
        rate?: number | null | undefined;
        imageData?: string | null | undefined;
        imageName?: string | null | undefined;
        litres?: number | null | undefined;
        bunkName?: string | null | undefined;
        bunkGps?: string | null | undefined;
    }>, "many">>;
}, z.ZodTypeAny, "passthrough">;
export declare function parseDeliverySave(body: unknown): {
    deliveries: Array<Record<string, unknown>>;
};
export declare function validateStepSubmit(step: TripWizardStep, body: unknown): Record<string, unknown>;
export declare function assertTripStatusTransition(from: string, to: string): void;
export declare function assertTripReadyForCompletion(flags: {
    startStepSubmitted?: boolean;
    farmStepSubmitted?: boolean;
    pickupStepSubmitted?: boolean;
    deliveryStepSubmitted?: boolean;
    expensesStepSubmitted?: boolean;
}): void;
