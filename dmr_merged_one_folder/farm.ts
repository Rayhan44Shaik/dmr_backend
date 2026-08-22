export type Farm = {
  id: number;
  farmNo: number;

  farmName: string;

  ownerName: string;

  supervisorName: string;

  phoneNumber: string;

  village: string;

  address: string;

  capacity: number;

  status: "Active" | "Inactive";
};