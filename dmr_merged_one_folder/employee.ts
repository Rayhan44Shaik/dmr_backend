export type Employee = {
  id: number;
  employeeNo: number;
  employeeName: string;
  department: string;
  role: string;
  phoneNumber: string;
  email: string;
  address: string;
  joiningDate: string;
  aadharNumber?: string;
  licenseNumber?: string;
  salary: number; // <-- must be present
  status: "Active" | "Inactive";
};