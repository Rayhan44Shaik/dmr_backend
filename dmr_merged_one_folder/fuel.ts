// src/storage/operations/fuel.ts

import { storage } from '../storage.manager';


const KEY = 'dmr-fuel-expenses';

export interface FuelExpense {
  id: string;
  vehicleNo: string;
  amount: number;
  fuelDate: string;
  fuelType: string;
  quantity: number;
  createdDate: string;
}

export const getFuelExpenses = (): FuelExpense[] => storage.get<FuelExpense[]>(KEY) || [];
export const saveFuelExpenses = (fuelExpenses: FuelExpense[]) => storage.set(KEY, fuelExpenses);
export const clearFuelExpenses = () => storage.remove(KEY);