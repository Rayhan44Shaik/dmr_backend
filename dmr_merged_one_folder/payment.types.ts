// src/modules/accounts/types/payment.types.ts

export interface Payment {
  id: string;
  paymentNo: string;
  paymentDate: string;
  paymentType: string;
  paymentMode: string;
  paidTo: string;
  amount: number;
  referenceNo: string;
  category: string;
  remarks?: string;
  status: 'Draft' | 'Approved' | 'Paid' | 'Cancelled';
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  attachments: PaymentAttachment[];
  paymentIds?: string[]; // References to FarmPayment IDs
}

export interface PaymentAttachment {
  id: string;
  paymentId: string;
  fileName: string;
  fileUrl: string;
  uploadedAt: string;
}

export interface PaymentAudit {
  id: string;
  paymentId: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'APPROVE' | 'PAY' | 'CANCEL';
  oldValue: string;
  newValue: string;
  performedBy: string;
  performedAt: string;
}