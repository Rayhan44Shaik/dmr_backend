import { storage } from '../storage.manager';

const KEY = 'dmr-shops';

export interface Shop {
  id: number;
  shopNo: number;
  shopName: string;
  ownerName: string;
  village: string;
  phoneNumber: string;
  status: 'Active' | 'Inactive';
}

export const getShops = (): Shop[] => storage.get<Shop[]>(KEY) || [];
export const saveShops = (shops: Shop[]) => storage.set(KEY, shops);
export const clearShops = () => storage.remove(KEY);