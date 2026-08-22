export interface User {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'manager' | 'user';
  avatar?: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: Record<string, string[]>;
}

export interface MenuItem {
  label: string;
  icon: string;
  path: string;
  children?: MenuItem[];
}