export const isEmail = (email: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

export const isPhone = (phone: string) =>
  /^[0-9]{10}$/.test(phone);

export const required = (value: any) => (value ? undefined : 'This field is required');