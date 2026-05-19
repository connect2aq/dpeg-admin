const BASE = process.env.NEXT_PUBLIC_API_URL;
// Static files (wwwroot) are served from the app root, not under /api/admin
export const STATIC_BASE = (BASE ?? '').replace(/\/api\/admin\/?$/, '').replace(/\/api\/?$/, '').replace(/\/$/, '');

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("adminToken") : null;
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
  if (res.status === 401) {
    if (typeof window !== "undefined") {
      localStorage.removeItem("adminToken");
      localStorage.removeItem("adminUser");
      window.location.href = "/Admin/login";
    }
    throw new Error("Unauthorized");
  }
  const text = await res.text();
  return text ? JSON.parse(text) : ({} as T);
}

export const api = {
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  get: <T>(path: string) => request<T>(path),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
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
  // Registrant & depositor counts
  totalUsers: number;
  activeInvestors: number;
  totalDepositors: number;
  totalInvestmentFiles: number;
  // Application pipeline
  pendingReviews: number;
  totalApplications: number;
  pendingRedemptions: number;
  // AUM & capital flows
  totalAUM: number;
  totalUnits: number;
  totalDeployedCommencement: number;
  totalWithdrawnCommencement: number;
  ytdDeployed: number;
  ytdWithdrawn: number;
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
  docuSignEnvelopeId?: string;
  docuSignStatus?: string;
  docuSignSentAt?: string;
  docuSignCompletedAt?: string;
  docuSignSignersJson?: string;
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
    // Identity
    dateOfBirth?: string;
    ownershipType?: string;
    // Spouse
    spouseFullName?: string;
    spouseEmail?: string;
    spouseDateOfBirth?: string;
    // Entity
    stateFormation?: string;
    signatoryName?: string;
    signatoryTitle?: string;
    // Custodian
    custodianName?: string;
    custodianAcct?: string;
    custodianPhone?: string;
    custodianEmail?: string;
    // Contact extras
    mailingAddress?: string;
    employer?: string;
    dayPhone?: string;
    nightPhone?: string;
    // Identity documents
    drivingLicenseNo?: string;
    drivingLicenseState?: string;
    drivingLicensePath?: string;
    taxCertificateNo?: string;
    taxCertificatePath?: string;
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
  totalUnitsOwned?: string;
  aggregatePurchasePrice?: string;
  email?: string;
  status: string;
  createdOn: string;
}

export interface RedemptionDetail extends RedemptionListItem {
  entityName?: string;
  signatoryName?: string;
  signatoryTitle?: string;
  printedName?: string;
  originalPurchaseDate?: string;
  proratedPreferredReturn?: string;
  addressLine1?: string;
  addressLine2?: string;
  addressLine3?: string;
  trancheApplicationId?: number;
  docuSignEnvelopeId?: string;
  docuSignStatus?: string;
  docuSignSentAt?: string;
  docuSignCompletedAt?: string;
  docuSignSignersJson?: string;
}

export interface AuditLogItem {
  id: number;
  timestampUtc: string;
  userId?: number;
  userEmail?: string;
  actorRole: string;
  ipAddress?: string;
  eventCategory: string;
  eventType: string;
  entityName?: string;
  entityId?: number;
  applicationId?: number;
  oldValuesJson?: string;
  newValuesJson?: string;
  metadataJson?: string;
  success: boolean;
  failureReason?: string;
  correlationId?: string;
}

export interface DocuSignSigner {
  name: string;
  email: string;
  roleName: string;
  status: string;
  signedDateTime?: string;
  sentDateTime?: string;
}

export interface DocuSignEnvelopeItem {
  applicationId: number;
  investorName?: string;
  email?: string;
  maritalStatus?: string;
  investorType: string;
  ppmRefNo?: number;
  submittedAt?: string;
  effectiveDate?: string;
  envelopeId: string;
  recordType: "Application" | "Redemption";
  docuSignStatus?: string;
  docuSignSentAt?: string;
  docuSignCompletedAt?: string;
  docuSignSignersJson?: string;
}

export interface DocuSignRecipient {
  name: string;
  email: string;
  roleName: string;
  status: string;
  signedAt?: string;
  sentAt?: string;
}

export interface DocuSignEnvelopeStatus {
  envelopeId: string;
  envelopeStatus: string;
  completedAt?: string;
  lastSignerDate?: string;
  recipients: DocuSignRecipient[];
}

type ApiResponse<T> = { success: boolean; data: T; message: string };

export const adminApi = {
  login: (email: string, password: string) =>
    api.post<
      ApiResponse<{
        token: string;
        userId: number;
        email: string;
        firstName: string;
        lastName: string;
      }>
    >("/login", { email, password }),
  dashboard: () => api.get<ApiResponse<DashboardStats>>("/dashboard"),
  users: (params: Record<string, string | number>) => {
    const q = new URLSearchParams(params as Record<string, string>).toString();
    return api.get<ApiResponse<PagedResult<UserListItem>>>(`/users?${q}`);
  },
  user: (id: number) => api.get<ApiResponse<UserDetail>>(`/users/${id}`),
  updateUserStatus: (id: number, status: string) =>
    api.put<ApiResponse<string>>(`/users/${id}/status`, { status }),
  applications: (params: Record<string, string | number>) => {
    const q = new URLSearchParams(params as Record<string, string>).toString();
    return api.get<ApiResponse<PagedResult<ApplicationListItem>>>(
      `/applications?${q}`,
    );
  },
  application: (id: number) =>
    api.get<ApiResponse<ApplicationDetail>>(`/applications/${id}`),
  updateApplicationStatus: (id: number, status: string, reviewNote?: string) =>
    api.put<ApiResponse<string>>(`/applications/${id}/status`, {
      status,
      reviewNote,
    }),
  updateApplicationEffectiveDate: (id: number, effectiveDate: string) =>
    api.put<ApiResponse<string>>(`/applications/${id}/effective-date`, {
      effectiveDate,
    }),
  updateApplicationSubmittedAt: (id: number, submittedAt: string) =>
    api.put<ApiResponse<string>>(`/applications/${id}/submitted-at`, {
      submittedAt,
    }),
  syncDocuSignDate: (id: number) =>
    api.post<ApiResponse<string>>(`/applications/${id}/sync-docusign-date`, {}),
  sendDocuSignEnvelope: (id: number) =>
    api.post<ApiResponse<string>>(`/applications/${id}/send-docusign`, {}),
  docuSignEnvelopes: () =>
    api.get<ApiResponse<DocuSignEnvelopeItem[]>>("/docusign-envelopes"),
  docuSignEnvelopeStatus: (envelopeId: string) =>
    api.get<ApiResponse<DocuSignEnvelopeStatus>>(
      `/docusign-envelopes/${envelopeId}/status`,
    ),
  redemptions: (params: Record<string, string | number>) => {
    const q = new URLSearchParams(params as Record<string, string>).toString();
    return api.get<ApiResponse<PagedResult<RedemptionListItem>>>(
      `/redemptions?${q}`,
    );
  },
  redemption: (id: number) =>
    api.get<ApiResponse<RedemptionDetail>>(`/redemptions/${id}`),
  updateRedemptionStatus: (id: number, status: string) =>
    api.put<ApiResponse<string>>(`/redemptions/${id}/status`, { status }),
  sendRedemptionDocuSignEnvelope: (id: number) =>
    api.post<ApiResponse<string>>(`/redemptions/${id}/send-docusign`, {}),
  auditLogs: (params: Record<string, string | number | boolean>) => {
    const q = new URLSearchParams(
      Object.fromEntries(
        Object.entries(params).map(([k, v]) => [k, String(v)]),
      ),
    ).toString();
    return api.get<ApiResponse<PagedResult<AuditLogItem>>>(`/audit-logs?${q}`);
  },
};
