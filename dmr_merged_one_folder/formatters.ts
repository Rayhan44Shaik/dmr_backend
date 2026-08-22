export const formatCurrency = (amount: number): string => {
  if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(2)} Cr`;
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(2)} L`;
  return `₹${amount.toLocaleString()}`;
};

export const formatDate = (date: string): string => {
  if (!date) return '-';
  try {
    const d = new Date(date + 'T00:00:00');
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return date;
  }
};

export const formatNumber = (num: number): string => {
  return num.toLocaleString();
};