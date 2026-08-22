export type BirdType = {
  id: number;
  birdTypeNo: number;

  birdType: string;

  averageWeight: number;

  description: string;

  status: "Active" | "Inactive";
};