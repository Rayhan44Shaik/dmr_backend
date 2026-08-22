/**
 * Format currency in Indian Rupees
 */
export const formatCurrency = (amount: number): string => {
  if (amount === undefined || amount === null || isNaN(amount)) {
    return '₹0';
  }
  return `₹${Number(amount).toLocaleString('en-IN')}`;
};

/**
 * Format currency with compact notation (Lakhs/Crores) - Indian numbering
 */
export const formatCurrencyCompact = (amount: number): string => {
  if (amount === undefined || amount === null || isNaN(amount)) {
    return '₹0';
  }
  if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(2)} Cr`;
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(2)} L`;
  return `₹${Number(amount).toLocaleString('en-IN')}`;
};

/**
 * Format number with compact notation (Lakhs/Crores) - Indian numbering, non-currency
 */
export const formatNumberCompact = (num: number): string => {
  if (num === undefined || num === null || isNaN(num)) {
    return '0';
  }
  if (num >= 10000000) return `${(num / 10000000).toFixed(2)} Cr`;
  if (num >= 100000) return `${(num / 100000).toFixed(2)} L`;
  return Number(num).toLocaleString('en-IN');
};

/**
 * Format number with commas
 */
export const formatNumber = (num: number): string => {
  if (num === undefined || num === null || isNaN(num)) {
    return '0';
  }
  return Number(num).toLocaleString('en-IN');
};

/**
 * Format date
 */
export const formatDate = (date: string | Date, format: 'short' | 'long' = 'short'): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '-';
  
  if (format === 'short') {
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

/**
 * Format time
 */
export const formatTime = (date: string | Date): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
};

/**
 * Format date and time
 */
export const formatDateTime = (date: string | Date): string => {
  return `${formatDate(date)} ${formatTime(date)}`;
};