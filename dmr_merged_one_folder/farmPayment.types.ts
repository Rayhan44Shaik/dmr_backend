// D:\Development\DMR-Poultries-ERP\frontend\dmr-poultries-web\src\modules\accounts\types\farmPayment.types.ts

export interface FarmPayment {
  id?: string;
  tripId: string;
  ratePerBird?: number;
  ratePerKg?: number;
  totalBirds?: number;
  dcWeight?: number;
  totalAmount?: number;
  amountPaid?: number;
  balance?: number;
  paymentStatus: 'Paid' | 'Partially Paid' | 'Unpaid';
  paymentMode?: 'Cash' | 'Bank Transfer' | 'UPI' | 'Cheque';
  paidDate?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}