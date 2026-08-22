import { storage } from '../storage.manager';

const KEY = 'vehicleTrips';

export interface Trip {
  id: number;
  tripNo: string;
  tripDate: string;
  vehicleNo: string;
  driverName: string;
  supervisorName: string;
  sourceFarm: string;
  status: 'Pending' | 'Completed';
  // ... other fields
}

export const getTrips = (): Trip[] => storage.get<Trip[]>(KEY) || [];
export const saveTrips = (trips: Trip[]) => storage.set(KEY, trips);
export const clearTrips = () => storage.remove(KEY);