// src/storage/operations/collections.ts

import { storage } from '../storage.manager';


const KEY = 'dmr-collections';

export interface Collection {
  id: string;
  shopName: string;
  amount: number;
  collectionDate: string;
  paymentModeName: string;
  collectorName: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  createdDate: string;
}

export const getCollections = (): Collection[] => storage.get<Collection[]>(KEY) || [];
export const saveCollections = (collections: Collection[]) => storage.set(KEY, collections);
export const clearCollections = () => storage.remove(KEY);