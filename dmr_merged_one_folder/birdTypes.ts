// src/storage/masters/birdTypes.ts

import { storage } from '../storage.manager';

const KEY = 'dmr-birdTypes';

export interface BirdType {
  id: number;
  name: string;
  description?: string;
  status: 'Active' | 'Inactive';
}

export const getBirdTypes = (): BirdType[] => storage.get<BirdType[]>(KEY) || [];
export const saveBirdTypes = (birdTypes: BirdType[]) => storage.set(KEY, birdTypes);
export const clearBirdTypes = () => storage.remove(KEY);