const BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('adminToken') : null;
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
  if (res.status === 401) {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('adminToken');
      localStorage.removeItem('adminUser');
      window.location.href = '/login';
    }
    throw new Error('Unauthorized');
  }
  const text = await res.text();
  return text ? JSON.parse(text) : ({} as T);
}

export const api = {
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  get: <T>(path: string) => request<T>(path),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
};

export interface AdminUser {
  userId: number;
  email: string;
  firstName: string;
  lastName: string;
}

export interface PagedResult<T> {
  items: T[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface DashboardStats {
  totalUsers: number;
  activeInvestors: number;
  pendingReviews: number;
  totalApplications: number;
  totalAUM: number;
  totalUnits: number;
  pendingRedemptions: number;
  recentApplications: ApplicationSummary[];
}

export interface UserListItem {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  status: string;
  emailVerified: boolean;
  currentOnboardingStep: number;
  createdOn: string;
  applicationCount: number;
}

export interface UserDetail extends UserListItem {
  applications: ApplicationSummary[];
}

export interface ApplicationSummary {
  id: number;
  investorType: string;
  investmentType?: string;
  status: string;
  submittedAt?: string;
  createdOn: string;
  totalAmount?: number;
  numUnits?: number;
  ppmRefNO?: number;
}

export interface ApplicationListItem extends ApplicationSummary {
  userId?: number;
  userFirstName: string;
  userLastName: string;
  userEmail: string;
}

export interface ApplicationDetail extends ApplicationListItem {
  entitySubType?: string;
  effectiveDate?: string;
  currentStep: number;
  investorProfile?: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    addressLine1?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    citizenship?: string;
    maritalStatus?: string;
    entityName?: string;
    ein?: string;
  };
  investment?: {
    numUnits: number;
    totalAmount?: number;
    ppmRefNO?: number;
    paymentMethod?: string;
    distributionPreference?: string;
    bankName?: string;
    accHolder?: string;
  };
}

export interface RedemptionListItem {
  id: number;
  sellingPartnerName?: string;
  effectiveDate?: string;
  investorType: string;
  unitsToRedeem?: string;
  aggregatePurchasePrice?: string;
  email?: string;
  status: string;
  createdOn: string;
}

type ApiResponse<T> = { success: boolean; data: T; message: string };

export const adminApi = {
  login: (email: string, password: string) =>
    api.post<ApiResponse<{ token: string; userId: number; email: string; firstName: string; lastName: string }>>('/admin/login', { email, password }),
  dashboard: () => api.get<ApiResponse<DashboardStats>>('/admin/dashboard'),
  users: (params: Record<string, string | number>) => {
    const q = new URLSearchParams(params as Record<string, string>).toString();
    return api.get<ApiResponse<PagedResult<UserListItem>>>(`/admin/users?${q}`);
  },
  user: (id: number) => api.get<ApiResponse<UserDetail>>(`/admin/users/${id}`),
  updateUserStatus: (id: number, status: string) =>
    api.put<ApiResponse<string>>(`/admin/users/${id}/status`, { status }),
  applications: (params: Record<string, string | number>) => {
    const q = new URLSearchParams(params as Record<string, string>).toString();
    return api.get<ApiResponse<PagedResult<ApplicationListItem>>>(`/admin/applications?${q}`);
  },
  application: (id: number) => api.get<ApiResponse<ApplicationDetail>>(`/admin/applications/${id}`),
  updateApplicationStatus: (id: number, status: string, reviewNote?: string) =>
    api.put<ApiResponse<string>>(`/admin/applications/${id}/status`, { status, reviewNote }),
  updateApplicationEffectiveDate: (id: number, effectiveDate: string) =>
    api.put<ApiResponse<string>>(`/admin/applications/${id}/effective-date`, { effectiveDate }),
  updateApplicationSubmittedAt: (id: number, submittedAt: string) =>
    api.put<ApiResponse<string>>(`/admin/applications/${id}/submitted-at`, { submittedAt }),
  redemptions: (params: Record<string, string | number>) => {
    const q = new URLSearchParams(params as Record<string, string>).toString();
    return api.get<ApiResponse<PagedResult<RedemptionListItem>>>(`/admin/redemptions?${q}`);
  },
  updateRedemptionStatus: (id: number, status: string) =>
    api.put<ApiResponse<string>>(`/admin/redemptions/${id}/status`, { status }),
};
