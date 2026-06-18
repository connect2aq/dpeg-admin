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
  if (!text) return {} as T;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(text.slice(0, 300));
  }
}

export const api = {
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  get: <T>(path: string) => request<T>(path),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  delete: <T>(path: string) =>
    request<T>(path, { method: "DELETE" }),
  deleteWithBody: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "DELETE", body: JSON.stringify(body) }),
};

export interface AdminUser {
  userId: number;
  email: string;
  firstName: string;
  lastName: string;
  adminRole: string; // Maker | Checker | Approver | SuperAdmin
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
  totalDepositCount: number;
  // Application pipeline
  pendingReviews: number;
  totalApplications: number;
  pendingRedemptions: number;
  // AUM & capital flows — all-time (since inception)
  totalAUM: number;
  totalUnits: number;
  totalDeployedCommencement: number;
  totalWithdrawnCommencement: number;
  interestPaidCommencement: number;
  // AUM & capital flows — date range
  totalDepositedDateRange: number;
  totalWithdrawnDateRange: number;
  interestPaidDateRange: number;
  // YTD (legacy)
  ytdDeployed: number;
  ytdWithdrawn: number;
  // Manually entered management figures
  deployedAmount?: number;
  bankAccountBalance?: number;
  balanceAsAtDate?: string;
  // Date range reflected back
  dateRangeFrom?: string;
  dateRangeTo?: string;
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
  isTestUser: boolean;
  isAdmin: boolean;
  adminRole?: string;
}

export interface UserDetail extends UserListItem {
  applications: ApplicationSummary[];
}

export interface ApplicationSummary {
  id: number;
  userId?: number;
  investorName?: string;
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
  investorName?: string;
}

export interface ApplicationDetail extends ApplicationListItem {
  entitySubType?: string;
  effectiveDate?: string;
  currentStep: number;
  reviewNote?: string;
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
    spouseSSN?: string;
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
    routingNumber?: number;
    accNumber?: string;
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
  reviewNote?: string;
  signatoryName?: string;
  signatoryTitle?: string;
  printedName?: string;
  originalPurchaseDate?: string;
  proratedPreferredReturn?: string;
  distributionClawback?: string;
  netAggregatePrice?: string;
  addressLine1?: string;
  addressLine2?: string;
  addressLine3?: string;
  trancheApplicationId?: number;
  docuSignEnvelopeId?: string;
  docuSignStatus?: string;
  docuSignSentAt?: string;
  docuSignCompletedAt?: string;
  docuSignSignersJson?: string;
  bankName?: string;
  bankAccountHolderName?: string;
  bankAccountNumber?: string;
  bankRoutingNumber?: string;
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

export interface DashboardTrends {
  monthlyApplications: { month: string; total: number; approved: number }[];
  investorTypeBreakdown: { type: string; count: number }[];
  monthlyCapital: { month: string; deployed: number }[];
}

// ── Historical Import ────────────────────────────────────────────────────────

export interface ImportRowResult {
  rowNumber: number;
  userEmail?: string;
  investorName?: string;
  success: boolean;
  errorMessage?: string;
  userId?: number;
  applicationId?: number;
  ppmRefNO?: number;
}

export interface ImportResult {
  sessionId: number;
  totalRows: number;
  succeeded: number;
  failed: number;
  rows: ImportRowResult[];
}

export interface WelcomeEmailRowResult {
  userId: number;
  email?: string;
  sent: boolean;
  alreadySent: boolean;
  errorMessage?: string;
}

export interface WelcomeEmailResult {
  total: number;
  sent: number;
  alreadySent: number;
  failed: number;
  rows: WelcomeEmailRowResult[];
}

export interface OdooSyncRowResult {
  applicationId: number;
  investorName?: string;
  email?: string;
  odooInvestorSynced: boolean;
  odooInvestmentSynced: boolean;
  errorMessage?: string;
}

export interface OdooSyncResult {
  total: number;
  succeeded: number;
  failed: number;
  rows: OdooSyncRowResult[];
}

export const historicalImportApi = {
  downloadTemplate: () => {
    const token = typeof window !== "undefined" ? localStorage.getItem("adminToken") : null;
    return fetch(`${BASE}/historical-import/template`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },

  upload: (file: File): Promise<{ success: boolean; data: ImportResult; message: string }> => {
    const token = typeof window !== "undefined" ? localStorage.getItem("adminToken") : null;
    const form = new FormData();
    form.append("file", file);
    return fetch(`${BASE}/historical-import/upload`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    }).then((r) => r.json());
  },

  sendWelcomeEmails: (
    userIds: number[]
  ): Promise<{ success: boolean; data: WelcomeEmailResult; message: string }> =>
    request(`/historical-import/send-welcome-emails`, {
      method: "POST",
      body: JSON.stringify({ userIds }),
    }),

  syncToOdoo: (
    applicationIds: number[]
  ): Promise<{ success: boolean; data: OdooSyncResult; message: string }> =>
    request(`/historical-import/sync-odoo`, {
      method: "POST",
      body: JSON.stringify({ applicationIds }),
    }),

  getSessions: (): Promise<{ success: boolean; data: ImportSessionListItem[]; message: string }> =>
    request(`/historical-import/sessions`),

  getSessionDetail: (sessionId: number): Promise<{ success: boolean; data: ImportSessionDetail; message: string }> =>
    request(`/historical-import/sessions/${sessionId}`),
};

export interface ImportSessionListItem {
  id: number;
  fileName: string;
  importedAt: string;
  importedByUserId: number;
  totalRows: number;
  succeeded: number;
  failed: number;
}

export interface ImportSessionRow {
  id: number;
  rowNumber: number;
  userEmail?: string;
  investorName?: string;
  success: boolean;
  errorMessage?: string;
  userId?: number;
  applicationId?: number;
  ppmRefNo?: number;
  welcomeEmailSentAt?: string;
  odooInvestorSyncedAt?: string;
  odooInvestmentSyncedAt?: string;
}

export interface ImportSessionDetail {
  id: number;
  fileName: string;
  importedAt: string;
  importedByUserId: number;
  totalRows: number;
  succeeded: number;
  failed: number;
  rows: ImportSessionRow[];
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
  dashboard: (params?: { from?: string; to?: string }) => {
    const qs = params && (params.from || params.to)
      ? '?' + new URLSearchParams(Object.fromEntries(
          Object.entries(params).filter(([, v]) => v != null)
        ) as Record<string, string>)
      : '';
    return api.get<ApiResponse<DashboardStats>>(`/dashboard${qs}`);
  },
  dashboardTrends: () => api.get<ApiResponse<DashboardTrends>>("/dashboard/trends"),
  users: (params: Record<string, string | number>) => {
    const q = new URLSearchParams(params as Record<string, string>).toString();
    return api.get<ApiResponse<PagedResult<UserListItem>>>(`/users?${q}`);
  },
  user: (id: number) => api.get<ApiResponse<UserDetail>>(`/users/${id}`),
  updateUserStatus: (id: number, status: string) =>
    api.put<ApiResponse<string>>(`/users/${id}/status`, { status }),
  setUserIsTest: (id: number, isTestUser: boolean) =>
    api.put<ApiResponse<string>>(`/users/${id}/is-test`, { isTestUser }),
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
  downloadDocuSignDocument: async (envelopeId: string): Promise<void> => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('adminToken') : null;
    const res = await fetch(`${BASE}/docusign-envelopes/${envelopeId}/document`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error('Download failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  },
  redemptions: (params: Record<string, string | number>) => {
    const q = new URLSearchParams(params as Record<string, string>).toString();
    return api.get<ApiResponse<PagedResult<RedemptionListItem>>>(
      `/redemptions?${q}`,
    );
  },
  redemption: (id: number) =>
    api.get<ApiResponse<RedemptionDetail>>(`/redemptions/${id}`),
  updateRedemptionStatus: (id: number, status: string, reviewNote?: string) =>
    api.put<ApiResponse<string>>(`/redemptions/${id}/status`, { status, reviewNote }),
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
  getBankDetails: () =>
    api.get<ApiResponse<BankDetails>>('/bank-details'),
  saveBankDetails: (dto: BankDetails) =>
    api.put<ApiResponse<string>>('/bank-details', dto),
  getDailyBalances: () =>
    api.get<ApiResponse<DailyBalanceLog[]>>('/daily-balances'),
  saveDailyBalance: (dto: DailyBalanceLog) =>
    api.put<ApiResponse<string>>('/daily-balances', dto),
  getNotificationEmails: () =>
    api.get<ApiResponse<NotificationEmail[]>>('/notification-emails'),
  addNotificationEmail: (emailAddress: string, label?: string) =>
    api.post<ApiResponse<NotificationEmail>>('/notification-emails', { emailAddress, label }),
  deleteNotificationEmail: (id: number) =>
    api.delete<ApiResponse<string>>(`/notification-emails/${id}`),
  distributions: (params: Record<string, string | number>) => {
    const q = new URLSearchParams(params as Record<string, string>).toString();
    return api.get<ApiResponse<PagedResult<DistributionListItem>>>(`/distributions?${q}`);
  },
  markDistributionPaid: (id: number, paidDate: string) =>
    api.post<ApiResponse<string>>(`/distributions/${id}/mark-paid`, { paidDate }),
  statements: (params: Record<string, string | number>) => {
    const q = new URLSearchParams(params as Record<string, string>).toString();
    return api.get<ApiResponse<PagedResult<StatementListItem>>>(`/statements?${q}`);
  },
  statementPdfUrl: (id: number) => `${BASE}/statements/${id}/pdf`,
  odooLogs: (params: Record<string, string | number>) => {
    const q = new URLSearchParams(params as Record<string, string>).toString();
    return api.get<ApiResponse<PagedResult<OdooLogItem>>>(`/odoo-logs?${q}`);
  },
  odooLog: (id: number) => api.get<ApiResponse<OdooLogDetail>>(`/odoo-logs/${id}`),
  emailLogs: (params: Record<string, string | number>) => {
    const q = new URLSearchParams(params as Record<string, string>).toString();
    return api.get<ApiResponse<PagedResult<EmailLogItem>>>(`/email-logs?${q}`);
  },
  emailLog: (id: number) => api.get<ApiResponse<EmailLogDetail>>(`/email-logs/${id}`),
  dailyInterestLogs: (params: Record<string, string | number>) => {
    const q = new URLSearchParams(params as Record<string, string>).toString();
    return api.get<ApiResponse<PagedResult<DailyInterestItem>>>(`/daily-interest?${q}`);
  },
  pushDailyInterestToOdoo: (id: number) =>
    api.post<ApiResponse<{ message: string }>>(`/daily-interest/${id}/push-to-odoo`, {}),
  previewDeleteDailyInterest: (ids: number[]) =>
    api.post<ApiResponse<DeleteDailyInterestPreviewResult>>('/daily-interest/delete-preview', { ids }),
  batchDeleteDailyInterest: (ids: number[], cascadeMonthly: boolean) =>
    api.deleteWithBody<ApiResponse<DeleteDailyInterestResult>>('/daily-interest/batch', { ids, cascadeMonthly }),

  // ── Admin CRUD: Bulk Delete ────────────────────────────────────────────
  bulkDeleteUsers: (userIds: number[]) =>
    api.deleteWithBody<ApiResponse<string>>('/users', { userIds }),
  bulkDeleteApplications: (applicationIds: number[]) =>
    api.deleteWithBody<ApiResponse<string>>('/applications', { applicationIds }),
  bulkDeleteRedemptions: (redemptionIds: number[]) =>
    api.deleteWithBody<ApiResponse<string>>('/redemptions', { redemptionIds }),
  createUser: (dto: CreateUserAdminRequest) =>
    api.post<ApiResponse<UserDetail>>('/users', dto),

  // ── Admin CRUD: Investment (Application) ──────────────────────────────
  createApplication: (userId: number, dto: CreateApplicationRequest) =>
    api.post<ApiResponse<ApplicationDetail>>(`/users/${userId}/applications`, dto),
  updateApplicationFull: (id: number, dto: CreateApplicationRequest) =>
    api.put<ApiResponse<string>>(`/applications/${id}/full`, dto),
  deleteApplication: (id: number) =>
    api.delete<ApiResponse<string>>(`/applications/${id}`),

  // ── Admin CRUD: Redemption ─────────────────────────────────────────────
  getRedemptionPreview: (trancheApplicationId: number, unitsToRedeem: number, effectiveDate: string) =>
    api.get<ApiResponse<RedemptionCalculationPreview>>(
      `/redemption-preview?trancheApplicationId=${trancheApplicationId}&unitsToRedeem=${unitsToRedeem}&effectiveDate=${effectiveDate}`,
    ),
  createRedemption: (dto: CreateRedemptionAdminRequest) =>
    api.post<ApiResponse<RedemptionDetail>>('/redemptions', dto),
  updateRedemptionFull: (id: number, dto: CreateRedemptionAdminRequest) =>
    api.put<ApiResponse<string>>(`/redemptions/${id}/full`, dto),
  deleteRedemption: (id: number) =>
    api.delete<ApiResponse<string>>(`/redemptions/${id}`),

  // ── Bulk catch-up ─────────────────────────────────────────────────────
  runBulkCatchUp: (from: string, to: string) =>
    api.post<ApiResponse<{ appsProcessed: number; logsCreated: number; errors: string[] }>>('/distributions/catch-up', { from, to }),

  // ── Manual distribution run ───────────────────────────────────────────
  simulateDistribution: (asOfDate: string) =>
    api.post<ApiResponse<DistributionRunResult[]>>('/distributions/simulate', { asOfDate }),
  executeDistribution: (asOfDate: string) =>
    api.post<ApiResponse<DistributionRunResult[]>>('/distributions/execute', { asOfDate }),
  pushDistributionToOdoo: (id: number) =>
    api.post<ApiResponse<{ ok: boolean; msg: string }>>(`/distributions/${id}/push-odoo`, {}),
  batchPushToOdoo: (ids: number[]) =>
    api.post<ApiResponse<{ pushed: number; failed: number }>>('/distributions/batch-push-odoo', { ids }),
  editDistributionPaidDate: (id: number, paidDate: string) =>
    api.post<ApiResponse<{ status?: string }>>(`/distributions/${id}/edit-paid-date`, { paidDate }),
  bulkMarkDistributionPaid: (ids: number[], paidDate: string) =>
    api.post<ApiResponse<{ marked: number; failed: number }>>('/distributions/bulk-mark-paid', { ids, paidDate }),
  bulkPushDailyInterestToOdoo: (ids: number[]) =>
    api.post<ApiResponse<{ pushed: number; failed: number }>>('/daily-interest/bulk-push-odoo', { ids }),

  // ── Admin CRUD: Distribution ───────────────────────────────────────────
  createDistribution: (dto: CreateDistributionRequest) =>
    api.post<ApiResponse<UserDistributionItem>>('/distributions', dto),
  updateDistribution: (id: number, dto: CreateDistributionRequest) =>
    api.put<ApiResponse<string>>(`/distributions/${id}`, dto),
  deleteDistribution: (id: number) =>
    api.delete<ApiResponse<string>>(`/distributions/${id}`),

  // ── User-scoped reads ──────────────────────────────────────────────────
  getUserDistributions: (userId: number) =>
    api.get<ApiResponse<UserDistributionItem[]>>(`/users/${userId}/distributions`),
  getUserRedemptions: (userId: number) =>
    api.get<ApiResponse<RedemptionListItem[]>>(`/users/${userId}/redemptions`),

  // ── Maker-Checker-Approver Workflow ────────────────────────────────────
  getPendingChanges: (params: Record<string, string | number> = {}) => {
    const q = new URLSearchParams(Object.fromEntries(Object.entries(params).map(([k,v]) => [k, String(v)]))).toString();
    return api.get<ApiResponse<PagedResult<PendingChangeItem>>>(`/pending-changes${q ? '?' + q : ''}`);
  },
  getPendingCounts: () =>
    api.get<ApiResponse<PendingCounts>>('/pending-changes/counts'),
  getPendingChange: (id: number) =>
    api.get<ApiResponse<PendingChangeDetail>>(`/pending-changes/${id}`),
  getActivePendingForRecord: (entityType: string, entityId: number) =>
    api.get<ApiResponse<PendingChangeItem | null>>(`/pending-changes/for-record?entityType=${entityType}&entityId=${entityId}`),
  getActivePendingForRecords: (entityType: string, entityIds: number[]) =>
    api.get<ApiResponse<PendingChangeItem[]>>(`/pending-changes/for-records?entityType=${entityType}&entityIds=${entityIds.join(',')}`),
  checkChange: (id: number, note?: string) =>
    api.post<ApiResponse<string>>(`/pending-changes/${id}/check`, { note }),
  approveChange: (id: number, note?: string) =>
    api.post<ApiResponse<string>>(`/pending-changes/${id}/approve`, { note }),
  rejectChange: (id: number, reason: string) =>
    api.post<ApiResponse<string>>(`/pending-changes/${id}/reject`, { reason }),
  cancelChange: (id: number) =>
    api.post<ApiResponse<string>>(`/pending-changes/${id}/cancel`, {}),
  setAdminRole: (userId: number, role: string | null) =>
    api.put<ApiResponse<string>>(`/users/${userId}/admin-role`, { adminRole: role }),
  changePassword: (userId: number, currentPassword: string, newPassword: string) =>
    api.put<ApiResponse<string>>(`/users/${userId}/change-password`, { currentPassword, newPassword }),
  resetPassword: (userId: number, newPassword: string) =>
    api.put<ApiResponse<string>>(`/users/${userId}/reset-password`, { newPassword }),
};

export interface NotificationEmail {
  id: number;
  emailAddress: string;
  label?: string;
}

export interface BankDetails {
  id?: number;
  beneficiaryName: string;
  bankName: string;
  accountNumber: string;
  routingSwiftCode: string;
  address: string;
}

export interface DailyBalanceLog {
  id?: number;
  date: string;
  bankAccountBalance: number;
  deployedAmount: number;
  notes?: string;
}

export interface DistributionListItem {
  id: number;
  applicationId: number;
  investorName: string;
  investorEmail?: string;
  distributionMonth: string;
  totalNetAmount: number;
  hasMismatch: boolean;
  paymentStatus: string;
  paidAt?: string;
  bankName?: string;
  bankAccountNumber?: string;
  createdOn: string;
}

export interface DistributionRunResult {
  applicationId: number;
  distributionMonth: string;
  investorName: string;
  investorEmail: string;
  ppmRefNo: string;
  totalNetAmount: number;
  recalculatedAmount: number;
  hasMismatch: boolean;
  totalDays: number;
  bankName: string;
  bankAccountNumber: string;
  alreadyRan: boolean;
  distributionLogId: number | null;
}

export interface StatementListItem {
  id: number;
  applicationId: number;
  investorName: string;
  investorEmail?: string;
  statementType: string;
  periodStart?: string;
  periodEnd?: string;
  generatedOn: string;
  hasPdf: boolean;
}

export interface OdooLogItem {
  id: number;
  correlationId: string;
  direction: string;
  endpoint: string;
  httpStatusCode?: number;
  attemptNumber: number;
  isSuccess: boolean;
  errorMessage?: string;
  durationMs?: number;
  entityType?: string;
  entityId?: string;
  createdOn: string;
}

export interface OdooLogDetail extends OdooLogItem {
  requestPayloadJson?: string;
  responsePayloadJson?: string;
}

export interface EmailLogItem {
  id: number;
  sentAtUtc: string;
  method: string;
  toAddresses: string;
  subject?: string;
  success: boolean;
  failureReason?: string;
  userId?: number;
  userEmail?: string;
  correlationId?: string;
}

export interface EmailLogDetail extends EmailLogItem {
  body?: string;
}

export interface DailyInterestItem {
  id: number;
  applicationId: number;
  investorName: string;
  investorEmail?: string;
  date: string;
  units: number;
  capital: number;
  annualRate: number;
  netInterest: number;
  odooInterestId?: string;
  odooStatus?: string;
  odooResponseMsg?: string;
  includedInMonthlyDistribution: boolean;
  createdOn: string;
}

export interface AffectedMonthlyDistribution {
  distributionLogId: number;
  applicationId: number;
  investorName: string;
  distributionMonth: string;
  odooStatus?: string;
  paymentStatus: string;
  totalNetAmount: number;
  siblingLogsCount: number;
}

export interface DeleteDailyInterestPreviewResult {
  safeCount: number;
  conflictedCount: number;
  affectedDistributions: AffectedMonthlyDistribution[];
}

export interface DeleteDailyInterestResult {
  deleted: number;
  cascadedDistributions: number;
  siblingLogsReset: number;
  skipped: number;
}

// ── Admin CRUD request/response types ─────────────────────────────────────

export interface CreateUserAdminRequest {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

export interface CreateApplicationRequest {
  investorType: string;
  investmentType?: string;
  entitySubType?: string;
  effectiveDate?: string;
  submittedAt?: string;
  firstName: string;
  lastName: string;
  phone?: string;
  dateOfBirth?: string;
  streetAddress?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  citizenship?: string;
  employer?: string;
  entityName?: string;
  ein?: string;
  stateFormation?: string;
  signatoryName?: string;
  signatoryTitle?: string;
  numUnits: number;
  totalAmount: number;
  ppmRefNO?: number;
  paymentMethod?: string;
  distributionPreference?: string;
  bankName?: string;
  accHolder?: string;
  routingNumber?: string;
  accNumber?: string;
}

export interface CreateRedemptionAdminRequest {
  trancheApplicationId?: number;
  sellingPartnerName?: string;
  investorType: string;
  entityName?: string;
  signatoryName?: string;
  signatoryTitle?: string;
  totalUnitsOwned?: string;
  unitsToRedeem?: string;
  originalPurchaseDate?: string;
  aggregatePurchasePrice?: string;
  proratedPreferredReturn?: string;
  distributionClawback?: string;
  netAggregatePrice?: string;
  effectiveDate?: string;
  printedName?: string;
  addressLine1?: string;
  addressLine2?: string;
  addressLine3?: string;
  email?: string;
  status?: string;
}

export interface RedemptionCalculationPreview {
  totalUnits: number;
  redeemUnits: number;
  originalPurchasePrice: number;
  daysInvested: number;
  monthsInvested: number;
  yearsInvested: number;
  isShortTerm: boolean;
  returnPerUnit: number;
  proratedPreferredReturn: number;
  aggregatePurchasePrice: number;
  isEarlyExit: boolean;
  completedMonthsDistributed: number;
  distributionClawback: number;
  netAggregatePrice: number;
}

export interface CreateDistributionRequest {
  applicationId: number;
  userId: number;
  distributionMonth: string;
  totalNetAmount: number;
  paymentStatus: string;
  paidAt?: string;
  bankName?: string;
  bankAccountHolderName?: string;
  bankAccountNumber?: string;
  bankRoutingNumber?: string;
}

export interface UserDistributionItem {
  id: number;
  applicationId: number;
  ppmRefNO?: number;
  distributionMonth: string;
  totalNetAmount: number;
  paymentStatus: string;
  paidAt?: string;
  bankName?: string;
  bankAccountNumber?: string;
  createdOn: string;
}

// ── Maker-Checker-Approver Workflow types ─────────────────────────────────

export interface PendingChangeItem {
  id: number;
  operationType: string;
  entityType: string;
  entityId?: number;
  targetUserId?: number;
  description: string;
  status: string; // Pending | Checked | Approved | Rejected | Cancelled
  makerUserId: number;
  makerName: string;
  makerEmail: string;
  makerNote?: string;
  createdOn: string;
  checkerUserId?: number;
  checkerName?: string;
  checkerNote?: string;
  checkedAt?: string;
  approverUserId?: number;
  approverName?: string;
  approverNote?: string;
  approvedAt?: string;
  rejectedByUserId?: number;
  rejectedByName?: string;
  rejectionReason?: string;
  rejectedAt?: string;
}

export interface PendingChangeDetail extends PendingChangeItem {
  payloadJson: string;
}

export interface PendingCounts {
  pendingForChecker: number;
  checkedForApprover: number;
}
