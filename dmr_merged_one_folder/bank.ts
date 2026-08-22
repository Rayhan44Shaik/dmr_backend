export type Bank = {
  id: number;
  bankNo: number;

  bankName: string;

  branch: string;

  accountNumber: string;

  ifscCode: string;

  upiId: string;

  status: "Active" | "Inactive";
};