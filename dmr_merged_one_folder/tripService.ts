import type { Trip } from "../types/trip";

const STORAGE_KEY = "vehicleTrips";

/* ================================
   Local Storage Helpers
================================ */

const loadTrips = (): Trip[] => {

  const data = localStorage.getItem(STORAGE_KEY);

  if (!data) return [];

  try {

    return JSON.parse(data);

  } catch {

    return [];

  }

};

const saveTrips = (trips: Trip[]) => {

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(trips)
  );

};

export const tripService = {

  /* ================================
     Get All Trips
  ================================ */

  getAll(): Trip[] {

    return loadTrips().sort(
      (a, b) =>
        new Date(b.tripDate).getTime() -
        new Date(a.tripDate).getTime()
    );

  },

  /* ================================
     Recent Trips
  ================================ */

  getRecent(limit = 5): Trip[] {

    return this.getAll().slice(0, limit);

  },

  /* ================================
     Get Single Trip
  ================================ */

  getById(id: number): Trip | undefined {

    return loadTrips().find(
      trip => trip.id === id
    );

  },

  /* ================================
     Create Trip
  ================================ */

  create(trip: Trip): Trip {

    const trips = loadTrips();

    trips.push({

      ...trip,

      createdAt:
        trip.createdAt ??
        new Date().toISOString(),

      updatedAt:
        new Date().toISOString()

    });

    saveTrips(trips);

    return trip;

  },

  /* ================================
     Upsert Trip (create or replace by id)
  ================================ */

  upsert(trip: Trip): Trip {
    const trips = loadTrips();
    const index = trips.findIndex((existing) => existing.id === trip.id);
    const now = new Date().toISOString();

    if (index === -1) {
      const created: Trip = {
        ...trip,
        createdAt: trip.createdAt ?? now,
        updatedAt: trip.updatedAt ?? now,
      };
      trips.push(created);
      saveTrips(trips);
      return created;
    }

    trips[index] = {
      ...trips[index],
      ...trip,
      updatedAt: trip.updatedAt ?? now,
    };
    saveTrips(trips);
    return trips[index];
  },

  /* ================================
     Update Trip
  ================================ */

  update(updatedTrip: Trip): Trip {

    const trips = loadTrips();

    const index = trips.findIndex(
      trip => trip.id === updatedTrip.id
    );

    if (index === -1)
      throw new Error("Trip not found.");

    trips[index] = {

      ...updatedTrip,

      updatedAt:
        new Date().toISOString()

    };

    saveTrips(trips);

    return trips[index];

  },

  /* ================================
     Delete Trip
  ================================ */

  remove(id: number): void {

    const trips = loadTrips().filter(
      trip => trip.id !== id
    );

    saveTrips(trips);

  },

  /* ================================
     Exists
  ================================ */

  exists(tripNo: string): boolean {

    return loadTrips().some(
      trip => trip.tripNo === tripNo
    );

  },

  /* ================================
     Count
  ================================ */

  count(): number {

    return loadTrips().length;

  },

  /* ================================
     Refresh
  ================================ */

  refresh(): Trip[] {

    return this.getAll();

  },

  /* ================================
     Clear
  ================================ */

  clear(): void {

    localStorage.removeItem(STORAGE_KEY);

  }

};