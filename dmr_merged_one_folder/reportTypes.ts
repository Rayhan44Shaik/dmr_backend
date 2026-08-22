export type ReportType =
  | 'weekly'
  | 'vehicle'
  | 'shopSales'
  | 'collection'
  | 'shopLedger'
  | 'expenses';

export interface ReportFilters {
  dateFrom: string;
  dateTo: string;
  format: 'PDF' | 'Excel';
  week?: string;
  financialYear?: string;
  includeCharts?: boolean;
  vehicle?: string;
  driver?: string;
  tripStatus?: string;
  shop?: string;
  collector?: string;
  paymentMode?: string;
  groupBy?: string;
  includeSections?: string[];
}

export interface ReportData {
  title: string;
  summary: Record<string, any>;
  details: any[] | Record<string, any>;
  charts?: any[];
  total?: Record<string, number>;
  isEmpty?: boolean;
}