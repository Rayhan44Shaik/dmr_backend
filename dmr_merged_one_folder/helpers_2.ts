/**
 * Generate a unique ID
 */
export const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
};

/**
 * Safe JSON parse
 */
export const safeJsonParse = <T>(json: string | null, fallback: T): T => {
  if (!json) return fallback;
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
};

/**
 * Debounce function - fixed without NodeJS namespace
 */
export const debounce = <T extends (...args: any[]) => void>(
  fn: T,
  delay: number = 300
): ((...args: Parameters<T>) => void) => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => fn(...args), delay);
  };
};

/**
 * Calculate percentage
 */
export const calculatePercentage = (value: number, total: number): number => {
  if (total === 0) return 0;
  return Number(((value / total) * 100).toFixed(2));
};

/**
 * Check if a date is within range
 */
export const isDateInRange = (date: Date, fromDate: Date, toDate: Date): boolean => {
  return date >= fromDate && date <= toDate;
};

/**
 * Get days between two dates
 */
export const getDaysBetween = (fromDate: Date, toDate: Date): number => {
  const diff = toDate.getTime() - fromDate.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

/**
 * Group array by key
 */
export const groupBy = <T, K extends keyof T>(array: T[], key: K): Map<T[K], T[]> => {
  const map = new Map<T[K], T[]>();
  array.forEach(item => {
    const keyValue = item[key];
    if (!map.has(keyValue)) {
      map.set(keyValue, []);
    }
    map.get(keyValue)!.push(item);
  });
  return map;
};

/**
 * Sum array of numbers
 */
export const sum = (array: number[]): number => {
  return array.reduce((acc, val) => acc + (val || 0), 0);
};

/**
 * Average of array of numbers
 */
export const average = (array: number[]): number => {
  if (array.length === 0) return 0;
  return sum(array) / array.length;
};

/**
 * Truncate string
 */
export const truncate = (str: string, length: number = 50): string => {
  if (!str || str.length <= length) return str;
  return str.substring(0, length) + '...';
};

/**
 * Capitalize first letter
 */
export const capitalize = (str: string): string => {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};