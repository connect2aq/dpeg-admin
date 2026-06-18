'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import AdminLayout from '@/components/AdminLayout';
import { StatusBadge } from '@/components/StatusBadge';
import { PendingBadge } from '@/components/PendingBadge';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import {
  adminApi,
  type UserDetail,
  type ApplicationDetail,
  type RedemptionListItem,
  type UserDistributionItem,
  type CreateApplicationRequest,
  type CreateRedemptionAdminRequest,
  type CreateDistributionRequest,
  type PendingChangeItem,
} from '@/lib/api';
import { type RedemptionCalculations } from '@/lib/redemptionCalculations';
import { BankDetailsPanel, RedemptionSummaryPanel } from '@/components/RedemptionSummaryPanels';

const USER_STATUSES = ['InProgress', 'UnderReview', 'Active', 'Inactive'];
const INVESTOR_TYPES = ['Individual', 'Entity', 'IRA', 'Trust'];
const INVESTMENT_TYPES = ['ShortTerm', 'LongTerm'];
const ENTITY_SUB_TYPES = ['LLC', 'Corporation', 'LP_GP', 'PensionFund', 'BankBroker', 'Other'];
const PAYMENT_METHODS = ['WireTransfer', 'CertifiedCheck'];
const DIST_PREFS = ['WireToBank', 'Reinvest'];
const PAYMENT_STATUSES = ['Pending', 'Sent', 'Paid', 'Failed'];

const EMPTY_CALC: RedemptionCalculations = {
  totalUnits: 0, redeemUnits: 0, originalPurchasePrice: 0, daysInvested: 0, monthsInvested: 0,
  yearsInvested: 0, isShortTerm: false, returnPerUnit: 0, proratedPreferredReturn: 0,
  aggregatePurchasePrice: 0, isEarlyExit: false, completedMonthsDistributed: 0,
  distributionClawback: 0, netAggregatePrice: 0,
};

const MARITAL_STATUSES = ['single', 'married', 'widowed', 'divorced'];

const emptyInvForm = (): CreateApplicationRequest => ({
  investorType: 'Individual', investmentType: '', entitySubType: '',
  effectiveDate: '', submittedAt: '',
  firstName: '', lastName: '', phone: '', dateOfBirth: '', streetAddress: '',
  city: '', state: '', zipCode: '', citizenship: '', employer: '',
  maritalStatus: '', ownershipType: '', mailingAddress: '',
  dayPhone: '', nightPhone: '',
  spouseFullName: '', spouseEmail: '', spouseDateOfBirth: '',
  custodianName: '', custodianAcct: '', custodianPhone: '', custodianEmail: '',
  entityName: '', ein: '', stateFormation: '', signatoryName: '', signatoryTitle: '',
  numUnits: 0, totalAmount: 0, ppmRefNO: undefined,
  paymentMethod: 'WireTransfer', distributionPreference: 'WireToBank',
  bankName: '', accHolder: '', routingNumber: '', accNumber: '',
});

const emptyRedeemForm = (): CreateRedemptionAdminRequest => ({
  trancheApplicationId: undefined, sellingPartnerName: '', investorType: 'Individual',
  entityName: '', signatoryName: '', signatoryTitle: '',
  totalUnitsOwned: '', unitsToRedeem: '', originalPurchaseDate: '',
  aggregatePurchasePrice: '', proratedPreferredReturn: '', effectiveDate: '',
  printedName: '', addressLine1: '', addressLine2: '', addressLine3: '', email: '',
  status: 'Active',
});

const emptyDistForm = (userId: number): CreateDistributionRequest => ({
  applicationId: 0, userId, distributionMonth: '', totalNetAmount: 0,
  paymentStatus: 'Pending', paidAt: '', bankName: '', bankAccountHolderName: '',
  bankAccountNumber: '', bankRoutingNumber: '',
});

const inputStyle = { width: '100%', padding: '8px 11px', border: '1.5px solid #e2e8f0', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' as const };
const labelStyle = { fontSize: 11, fontWeight: 700 as const, color: '#475569', display: 'block' as const, marginBottom: 3, textTransform: 'uppercase' as const, letterSpacing: '0.04em' };
const selectStyle = { ...inputStyle, background: 'white' };
const readOnlyBoxStyle = { ...inputStyle, background: '#f8fafc', color: '#475569' };

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#0f2342', borderBottom: '1px solid #e2e8f0', paddingBottom: 6, marginBottom: 12, marginTop: 8 }}>
      {children}
    </div>
  );
}

function ModalOverlay({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, padding: '40px 16px', overflowY: 'auto' }}>
      <div style={{ background: 'white', borderRadius: 12, width: 680, maxWidth: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', marginBottom: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid #e2e8f0' }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: '#0f2342', margin: 0 }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: '20px 24px' }}>{children}</div>
      </div>
    </div>
  );
}

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const userId = Number(id);
  const { user: authUser } = useAdminAuth();
  const adminRole = authUser?.adminRole ?? 'SuperAdmin';
  const isSuperAdmin = adminRole === 'SuperAdmin';

  const [user, setUser] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [togglingTest, setTogglingTest] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [msg, setMsg] = useState('');
  const [testMsg, setTestMsg] = useState('');
  const [roleChanging, setRoleChanging] = useState(false);
  const [roleMsg, setRoleMsg] = useState('');
  const [pendingMsg, setPendingMsg] = useState(''); // shown when non-SuperAdmin submits

  // Password change / reset state
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Redemptions & distributions for this user
  const [userRedemptions, setUserRedemptions] = useState<RedemptionListItem[]>([]);
  const [userDistributions, setUserDistributions] = useState<UserDistributionItem[]>([]);

  // Pending-change badges (persist across navigation, unlike the transient pendingMsg toast)
  const [invPendingMap, setInvPendingMap] = useState<Record<number, PendingChangeItem>>({});
  const [redeemPendingMap, setRedeemPendingMap] = useState<Record<number, PendingChangeItem>>({});

  // Investment modal state
  const [invModal, setInvModal] = useState<'create' | 'edit' | null>(null);
  const [invForm, setInvForm] = useState<CreateApplicationRequest>(emptyInvForm());
  const [editingInvId, setEditingInvId] = useState<number | null>(null);
  const [invSubmitting, setInvSubmitting] = useState(false);
  const [invMsg, setInvMsg] = useState('');
  const [invSSNMasked, setInvSSNMasked] = useState('');
  const [invSpouseSSNMasked, setInvSpouseSSNMasked] = useState('');
  const [invDLMasked, setInvDLMasked] = useState('');
  const [invTaxCertMasked, setInvTaxCertMasked] = useState('');
  const [confirmDeleteInvId, setConfirmDeleteInvId] = useState<number | null>(null);
  const [deletingInv, setDeletingInv] = useState(false);

  // Redemption modal state
  const [redeemModal, setRedeemModal] = useState<'create' | 'edit' | null>(null);
  const [redeemForm, setRedeemForm] = useState<CreateRedemptionAdminRequest>(emptyRedeemForm());
  const [editingRedeemId, setEditingRedeemId] = useState<number | null>(null);
  const [redeemSubmitting, setRedeemSubmitting] = useState(false);
  const [redeemMsg, setRedeemMsg] = useState('');
  const [deletingRedeemId, setDeletingRedeemId] = useState<number | null>(null);
  const [trancheDetail, setTrancheDetail] = useState<ApplicationDetail | null>(null);
  const [trancheLoading, setTrancheLoading] = useState(false);

  // Distribution modal state
  const [distModal, setDistModal] = useState<'create' | 'edit' | null>(null);
  const [distForm, setDistForm] = useState<CreateDistributionRequest>(emptyDistForm(userId));
  const [editingDistId, setEditingDistId] = useState<number | null>(null);
  const [distSubmitting, setDistSubmitting] = useState(false);
  const [distMsg, setDistMsg] = useState('');
  const [deletingDistId, setDeletingDistId] = useState<number | null>(null);

  const loadUser = useCallback(() => {
    adminApi.user(userId)
      .then(r => { if (r.success) { setUser(r.data); setNewStatus(r.data.status); } })
      .finally(() => setLoading(false));
  }, [userId]);

  const loadRedemptions = useCallback(() => {
    adminApi.getUserRedemptions(userId)
      .then(r => { if (r.success) setUserRedemptions(r.data); });
  }, [userId]);

  const loadDistributions = useCallback(() => {
    adminApi.getUserDistributions(userId)
      .then(r => { if (r.success) setUserDistributions(r.data); });
  }, [userId]);

  useEffect(() => { loadUser(); loadRedemptions(); loadDistributions(); }, [loadUser, loadRedemptions, loadDistributions]);

  useEffect(() => {
    const ids = user?.applications.map(a => a.id) ?? [];
    if (ids.length === 0) { setInvPendingMap({}); return; }
    adminApi.getActivePendingForRecords('Investment', ids).then(r => {
      if (r.success) {
        const map: Record<number, PendingChangeItem> = {};
        r.data.forEach(p => { if (p.entityId) map[p.entityId] = p; });
        setInvPendingMap(map);
      }
    });
  }, [user]);

  useEffect(() => {
    const ids = userRedemptions.map(r => r.id);
    if (ids.length === 0) { setRedeemPendingMap({}); return; }
    adminApi.getActivePendingForRecords('Redemption', ids).then(r => {
      if (r.success) {
        const map: Record<number, PendingChangeItem> = {};
        r.data.forEach(p => { if (p.entityId) map[p.entityId] = p; });
        setRedeemPendingMap(map);
      }
    });
  }, [userRedemptions]);

  const updateStatus = async () => {
    if (!user || newStatus === user.status) return;
    setUpdating(true);
    const r = await adminApi.updateUserStatus(user.id, newStatus);
    setMsg(r.success ? 'Status updated.' : r.message);
    if (r.success) setUser(u => u ? { ...u, status: newStatus } : u);
    setUpdating(false);
    setTimeout(() => setMsg(''), 3000);
  };

  const toggleTestUser = async () => {
    if (!user) return;
    const newVal = !user.isTestUser;
    setTogglingTest(true);
    const r = await adminApi.setUserIsTest(user.id, newVal);
    setTestMsg(r.success ? r.data : r.message);
    if (r.success) setUser(u => u ? { ...u, isTestUser: newVal } : u);
    setTogglingTest(false);
    setTimeout(() => setTestMsg(''), 3000);
  };

  // ── Investment handlers ────────────────────────────────────────────────────

  const openCreateInvestment = () => {
    setInvForm(emptyInvForm());
    setEditingInvId(null);
    setInvMsg('');
    setInvSSNMasked(''); setInvSpouseSSNMasked(''); setInvDLMasked(''); setInvTaxCertMasked('');
    setInvModal('create');
  };

  const openEditInvestment = async (appId: number) => {
    const r = await adminApi.application(appId);
    if (!r.success || !r.data) return;
    const d = r.data;
    const p = d.investorProfile;
    const inv = d.investment;
    setInvForm({
      investorType: d.investorType || 'Individual',
      investmentType: d.investmentType || '',
      entitySubType: d.entitySubType || '',
      effectiveDate: d.effectiveDate ? d.effectiveDate.split('T')[0] : '',
      submittedAt: d.submittedAt ? d.submittedAt.split('T')[0] : '',
      firstName: p?.firstName || '',
      lastName: p?.lastName || '',
      phone: p?.phone || '',
      dateOfBirth: p?.dateOfBirth || '',
      streetAddress: p?.addressLine1 || '',
      city: p?.city || '',
      state: p?.state || '',
      zipCode: p?.zipCode || '',
      citizenship: p?.citizenship || '',
      employer: p?.employer || '',
      maritalStatus: p?.maritalStatus || '',
      ownershipType: p?.ownershipType || '',
      mailingAddress: p?.mailingAddress || '',
      dayPhone: p?.dayPhone || '',
      nightPhone: p?.nightPhone || '',
      spouseFullName: p?.spouseFullName || '',
      spouseEmail: p?.spouseEmail || '',
      spouseDateOfBirth: p?.spouseDateOfBirth || '',
      custodianName: p?.custodianName || '',
      custodianAcct: p?.custodianAcct || '',
      custodianPhone: p?.custodianPhone || '',
      custodianEmail: p?.custodianEmail || '',
      entityName: p?.entityName || '',
      ein: p?.ein || '',
      stateFormation: p?.stateFormation || '',
      signatoryName: p?.signatoryName || '',
      signatoryTitle: p?.signatoryTitle || '',
      numUnits: inv?.numUnits || 0,
      totalAmount: inv?.totalAmount || 0,
      ppmRefNO: inv?.ppmRefNO ?? undefined,
      paymentMethod: inv?.paymentMethod || 'WireTransfer',
      distributionPreference: inv?.distributionPreference || 'WireToBank',
      bankName: inv?.bankName || '',
      accHolder: inv?.accHolder || '',
      routingNumber: inv?.routingNumber ? String(inv.routingNumber) : '',
      accNumber: inv?.accNumber || '',
    });
    setInvSSNMasked(p?.ssNumberMasked || '');
    setInvSpouseSSNMasked(p?.spouseSSN || '');
    setInvDLMasked(p?.drivingLicenseNo || '');
    setInvTaxCertMasked(p?.taxCertificateNo || '');
    setEditingInvId(appId);
    setInvMsg('');
    setInvModal('edit');
  };

  const submitInvestment = async (e: React.FormEvent) => {
    e.preventDefault();
    setInvSubmitting(true);
    setInvMsg('');
    if (invModal === 'create') {
      const r = await adminApi.createApplication(userId, invForm);
      if (r.success) {
        setInvModal(null);
        if (isSuperAdmin) loadUser();
        else { setPendingMsg(`Change submitted for approval — ${r.message}`); }
      } else setInvMsg(r.message || 'Failed to create investment.');
    } else if (editingInvId) {
      const r = await adminApi.updateApplicationFull(editingInvId, invForm);
      if (r.success) {
        setInvModal(null);
        if (isSuperAdmin) loadUser();
        else { setPendingMsg(`Change submitted for approval — ${r.message}`); }
      } else setInvMsg(r.message || 'Failed to update investment.');
    }
    setInvSubmitting(false);
  };

  const deleteInvestment = async () => {
    if (!confirmDeleteInvId) return;
    setDeletingInv(true);
    const r = await adminApi.deleteApplication(confirmDeleteInvId);
    if (r.success) {
      setConfirmDeleteInvId(null);
      if (isSuperAdmin) loadUser();
      else setPendingMsg(`Delete request submitted for approval — ${r.message}`);
    } else alert(r.message || 'Delete failed.');
    setDeletingInv(false);
  };

  // ── Redemption handlers ────────────────────────────────────────────────────

  const openCreateRedemption = () => {
    setRedeemForm(emptyRedeemForm());
    setTrancheDetail(null);
    setEditingRedeemId(null);
    setRedeemMsg('');
    setRedeemModal('create');
  };

  // Populate the read-only investment/bank fields from the selected tranche's full detail
  const loadTrancheDetail = async (appId: number, investorTypeFromList?: string) => {
    setTrancheLoading(true);
    const r = await adminApi.application(appId);
    setTrancheLoading(false);
    if (!r.success || !r.data) { setTrancheDetail(null); return; }
    const app = r.data;
    setTrancheDetail(app);
    const isEntity = (investorTypeFromList ?? app.investorType) === 'Entity';
    setRedeemForm(f => ({
      ...f,
      trancheApplicationId: appId,
      investorType: app.investorType || f.investorType,
      totalUnitsOwned: app.investment?.numUnits != null ? String(app.investment.numUnits) : f.totalUnitsOwned,
      originalPurchaseDate: app.effectiveDate ? app.effectiveDate.slice(0, 10) : f.originalPurchaseDate,
      sellingPartnerName: isEntity
        ? (app.investorProfile?.entityName || f.sellingPartnerName)
        : `${app.investorProfile?.firstName || ''} ${app.investorProfile?.lastName || ''}`.trim() || f.sellingPartnerName,
      entityName: app.investorProfile?.entityName || f.entityName,
      signatoryName: app.investorProfile?.signatoryName || f.signatoryName,
      signatoryTitle: app.investorProfile?.signatoryTitle || f.signatoryTitle,
      email: app.investorProfile?.email || f.email,
      effectiveDate: f.effectiveDate || new Date().toISOString().slice(0, 10),
    }));
  };

  const onTrancheChange = (appIdStr: string) => {
    const id = Number(appIdStr);
    if (!id) {
      setTrancheDetail(null);
      setRedeemForm(f => ({ ...f, trancheApplicationId: undefined }));
      return;
    }
    const app = user?.applications.find(a => a.id === id);
    loadTrancheDetail(id, app?.investorType);
  };

  const openEditRedemption = async (redeemId: number) => {
    const r = await adminApi.redemption(redeemId);
    if (!r.success || !r.data) return;
    const d = r.data;
    setRedeemForm({
      trancheApplicationId: d.trancheApplicationId ?? undefined,
      sellingPartnerName: d.sellingPartnerName || '',
      investorType: d.investorType || 'Individual',
      entityName: d.entityName || '',
      signatoryName: d.signatoryName || '',
      signatoryTitle: d.signatoryTitle || '',
      totalUnitsOwned: d.totalUnitsOwned || '',
      unitsToRedeem: d.unitsToRedeem || '',
      originalPurchaseDate: d.originalPurchaseDate || '',
      aggregatePurchasePrice: d.aggregatePurchasePrice || '',
      proratedPreferredReturn: d.proratedPreferredReturn || '',
      effectiveDate: d.effectiveDate || '',
      printedName: d.printedName || '',
      addressLine1: d.addressLine1 || '',
      addressLine2: d.addressLine2 || '',
      addressLine3: d.addressLine3 || '',
      email: d.email || '',
      status: d.status || 'Active',
    });
    setEditingRedeemId(redeemId);
    setRedeemMsg('');
    setRedeemModal('edit');
    if (d.trancheApplicationId) await loadTrancheDetail(d.trancheApplicationId, d.investorType);
    else setTrancheDetail(null);
  };

  const [redeemCalc, setRedeemCalc] = useState<RedemptionCalculations>(EMPTY_CALC);

  useEffect(() => {
    const trancheId = redeemForm.trancheApplicationId;
    const units = parseInt(redeemForm.unitsToRedeem || '0') || 0;
    if (!trancheId || units <= 0 || !redeemForm.effectiveDate) {
      setRedeemCalc(EMPTY_CALC);
      return;
    }
    const timer = setTimeout(() => {
      adminApi.getRedemptionPreview(trancheId, units, redeemForm.effectiveDate!)
        .then(r => setRedeemCalc(r.success && r.data ? r.data : EMPTY_CALC))
        .catch(() => setRedeemCalc(EMPTY_CALC));
    }, 350);
    return () => clearTimeout(timer);
  }, [redeemForm.trancheApplicationId, redeemForm.unitsToRedeem, redeemForm.effectiveDate]);

  const submitRedemption = async (e: React.FormEvent) => {
    e.preventDefault();
    setRedeemSubmitting(true);
    setRedeemMsg('');
    // Server recomputes aggregatePurchasePrice/proratedPreferredReturn/distributionClawback/netAggregatePrice
    // from the linked tranche before saving — the previewed figures here are display-only.
    if (redeemModal === 'create') {
      const r = await adminApi.createRedemption(redeemForm);
      if (r.success) {
        setRedeemModal(null);
        if (isSuperAdmin) loadRedemptions();
        else setPendingMsg(`Change submitted for approval — ${r.message}`);
      } else setRedeemMsg(r.message || 'Failed to create redemption.');
    } else if (editingRedeemId) {
      const r = await adminApi.updateRedemptionFull(editingRedeemId, redeemForm);
      if (r.success) {
        setRedeemModal(null);
        if (isSuperAdmin) loadRedemptions();
        else setPendingMsg(`Change submitted for approval — ${r.message}`);
      } else setRedeemMsg(r.message || 'Failed to update redemption.');
    }
    setRedeemSubmitting(false);
  };

  const deleteRedemption = async (redeemId: number) => {
    if (!window.confirm(isSuperAdmin ? 'Delete this redemption record?' : 'Submit delete request for approval?')) return;
    setDeletingRedeemId(redeemId);
    const r = await adminApi.deleteRedemption(redeemId);
    if (r.success) {
      if (isSuperAdmin) loadRedemptions();
      else setPendingMsg(`Delete request submitted for approval — ${r.message}`);
    } else alert(r.message || 'Delete failed.');
    setDeletingRedeemId(null);
  };

  // ── Distribution handlers ──────────────────────────────────────────────────

  const openCreateDistribution = () => {
    setDistForm(emptyDistForm(userId));
    setEditingDistId(null);
    setDistMsg('');
    setDistModal('create');
  };

  const openEditDistribution = (d: UserDistributionItem) => {
    const month = d.distributionMonth
      ? new Date(d.distributionMonth).toISOString().slice(0, 7)
      : '';
    setDistForm({
      applicationId: d.applicationId,
      userId,
      distributionMonth: month + '-01',
      totalNetAmount: d.totalNetAmount,
      paymentStatus: d.paymentStatus,
      paidAt: d.paidAt ? d.paidAt.split('T')[0] : '',
      bankName: d.bankName || '',
      bankAccountHolderName: '',
      bankAccountNumber: d.bankAccountNumber || '',
      bankRoutingNumber: '',
    });
    setEditingDistId(d.id);
    setDistMsg('');
    setDistModal('edit');
  };

  const submitDistribution = async (e: React.FormEvent) => {
    e.preventDefault();
    setDistSubmitting(true);
    setDistMsg('');
    const payload = {
      ...distForm,
      distributionMonth: distForm.distributionMonth.length === 7
        ? distForm.distributionMonth + '-01'
        : distForm.distributionMonth,
    };
    if (distModal === 'create') {
      const r = await adminApi.createDistribution(payload);
      if (r.success) {
        setDistModal(null);
        if (isSuperAdmin) loadDistributions();
        else setPendingMsg(`Change submitted for approval — ${r.message}`);
      } else setDistMsg(r.message || 'Failed to create distribution.');
    } else if (editingDistId) {
      const r = await adminApi.updateDistribution(editingDistId, payload);
      if (r.success) {
        setDistModal(null);
        if (isSuperAdmin) loadDistributions();
        else setPendingMsg(`Change submitted for approval — ${r.message}`);
      } else setDistMsg(r.message || 'Failed to update distribution.');
    }
    setDistSubmitting(false);
  };

  const deleteDistribution = async (distId: number) => {
    if (!window.confirm(isSuperAdmin ? 'Delete this distribution record?' : 'Submit delete request for approval?')) return;
    setDeletingDistId(distId);
    const r = await adminApi.deleteDistribution(distId);
    if (r.success) {
      if (isSuperAdmin) loadDistributions();
      else setPendingMsg(`Delete request submitted for approval — ${r.message}`);
    } else alert(r.message || 'Delete failed.');
    setDeletingDistId(null);
  };

  if (loading) return <AdminLayout><div style={{ padding: 40, color: '#64748b' }}>Loading...</div></AdminLayout>;
  if (!user) return <AdminLayout><div style={{ padding: 40 }}><p style={{ color: '#ef4444' }}>User not found.</p></div></AdminLayout>;

  return (
    <AdminLayout>
      <div style={{ padding: '32px 36px', maxWidth: 980 }}>
        {/* Breadcrumb */}
        <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 20 }}>
          <Link href="/users" style={{ color: '#b8923a', textDecoration: 'none' }}>Users</Link> / {user.firstName} {user.lastName}
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f2342' }}>{user.firstName} {user.lastName}</h1>
              {user.isTestUser && (
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', background: '#fef3c7', color: '#92400e', border: '1px solid #fbbf24', borderRadius: 4, padding: '2px 8px' }}>TEST USER</span>
              )}
            </div>
            <p style={{ color: '#64748b', marginTop: 4 }}>{user.email}</p>
          </div>
          <StatusBadge status={user.status} />
        </div>

        {/* Status update */}
        <div className="card" style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0f2342', marginBottom: 16 }}>Update Status</h2>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <select value={newStatus} onChange={e => setNewStatus(e.target.value)} style={{ padding: '10px 14px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, background: 'white' }}>
              {USER_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <button className="btn-primary" onClick={updateStatus} disabled={updating || newStatus === user.status}>
              {updating ? 'Updating...' : 'Apply'}
            </button>
            {msg && <span style={{ fontSize: 13, color: msg.includes('updated') ? '#10b981' : '#ef4444' }}>{msg}</span>}
          </div>
        </div>

        {/* Test user flag */}
        <div className="card" style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0f2342', marginBottom: 8 }}>Test User</h2>
          <p style={{ fontSize: 13, color: '#64748b', marginBottom: 14 }}>Test users are excluded from dashboard statistics, reports, and Excel exports.</p>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button onClick={toggleTestUser} disabled={togglingTest} style={{ padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: '1.5px solid', cursor: togglingTest ? 'not-allowed' : 'pointer', background: user.isTestUser ? '#fef3c7' : 'white', borderColor: user.isTestUser ? '#fbbf24' : '#e2e8f0', color: user.isTestUser ? '#92400e' : '#475569' }}>
              {togglingTest ? 'Saving...' : user.isTestUser ? 'Remove test flag' : 'Mark as test user'}
            </button>
            {testMsg && <span style={{ fontSize: 13, color: '#10b981' }}>{testMsg}</span>}
          </div>
        </div>

        {/* Pending change toast */}
        {pendingMsg && (
          <div style={{ background: '#fffbeb', border: '1.5px solid #fbbf24', borderRadius: 8, padding: '12px 16px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: '#92400e', fontWeight: 600 }}>⏳ {pendingMsg}</span>
            <button onClick={() => setPendingMsg('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 16 }}>×</button>
          </div>
        )}

        {/* Admin Role Management — SuperAdmin only */}
        {isSuperAdmin && (
          <div className="card" style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0f2342', marginBottom: 8 }}>Admin Role</h2>
            <p style={{ fontSize: 13, color: '#64748b', marginBottom: 14 }}>
              Set the admin workflow role for this user. Only SuperAdmin can change roles.
            </p>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <select
                id="adminRoleSelect"
                defaultValue={user.adminRole ?? ''}
                style={{ padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 6, fontSize: 13, background: 'white' }}
              >
                <option value="">No admin role</option>
                <option value="Maker">Maker</option>
                <option value="Checker">Checker</option>
                <option value="Approver">Approver</option>
                <option value="SuperAdmin">SuperAdmin</option>
              </select>
              <button
                className="btn-primary"
                disabled={roleChanging}
                onClick={async () => {
                  const sel = (document.getElementById('adminRoleSelect') as HTMLSelectElement).value;
                  setRoleChanging(true);
                  const r = await adminApi.setAdminRole(userId, sel || null);
                  setRoleMsg(r.success ? 'Role updated.' : r.message);
                  setRoleChanging(false);
                  setTimeout(() => setRoleMsg(''), 3000);
                }}
              >
                {roleChanging ? 'Saving...' : 'Set Role'}
              </button>
              {roleMsg && <span style={{ fontSize: 13, color: roleMsg === 'Role updated.' ? '#10b981' : '#ef4444' }}>{roleMsg}</span>}
            </div>
          </div>
        )}

        {/* Change / Reset Password — admin accounts only; investors use the public forgot-password flow */}
        {(authUser?.userId === userId || (isSuperAdmin && user.isAdmin)) && (() => {
          const isOwn = authUser?.userId === userId;
          const handlePw = async () => {
            if (pwNew !== pwConfirm) { setPwMsg({ ok: false, text: 'New passwords do not match.' }); return; }
            if (pwNew.length < 8) { setPwMsg({ ok: false, text: 'Password must be at least 8 characters.' }); return; }
            setPwSaving(true);
            const r = isOwn
              ? await adminApi.changePassword(userId, pwCurrent, pwNew)
              : await adminApi.resetPassword(userId, pwNew);
            setPwMsg({ ok: r.success, text: r.success ? (isOwn ? 'Password changed.' : 'Password reset.') : (r.message || 'Failed.') });
            if (r.success) { setPwCurrent(''); setPwNew(''); setPwConfirm(''); }
            setPwSaving(false);
            setTimeout(() => setPwMsg(null), 4000);
          };
          return (
            <div className="card" style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0f2342', marginBottom: 8 }}>
                {isOwn ? 'Change Password' : 'Reset Password'}
              </h2>
              <p style={{ fontSize: 13, color: '#64748b', marginBottom: 14 }}>
                {isOwn ? 'Enter your current password and choose a new one.' : 'Set a new password for this admin account.'}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 360 }}>
                {isOwn && (
                  <div>
                    <label style={labelStyle}>Current Password</label>
                    <input
                      type="password"
                      value={pwCurrent}
                      onChange={e => setPwCurrent(e.target.value)}
                      style={inputStyle}
                      autoComplete="current-password"
                    />
                  </div>
                )}
                <div>
                  <label style={labelStyle}>New Password</label>
                  <input
                    type="password"
                    value={pwNew}
                    onChange={e => setPwNew(e.target.value)}
                    style={inputStyle}
                    autoComplete="new-password"
                  />
                </div>
                <div>
                  <label style={labelStyle}>Confirm New Password</label>
                  <input
                    type="password"
                    value={pwConfirm}
                    onChange={e => setPwConfirm(e.target.value)}
                    style={inputStyle}
                    autoComplete="new-password"
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button
                    className="btn-primary"
                    onClick={handlePw}
                    disabled={pwSaving}
                    style={{ opacity: pwSaving ? 0.7 : 1 }}
                  >
                    {pwSaving ? 'Saving...' : isOwn ? 'Change Password' : 'Reset Password'}
                  </button>
                  {pwMsg && (
                    <span style={{ fontSize: 13, color: pwMsg.ok ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                      {pwMsg.text}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Account details */}
        <div className="card" style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0f2342', marginBottom: 16 }}>Account Details</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {[
              ['Email Verified', user.emailVerified ? '✓ Yes' : '✗ No'],
              ['Onboarding Step', `${user.currentOnboardingStep} / 7`],
              ['Applications', String(user.applicationCount)],
              ['Registered', new Date(user.createdOn).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })],
            ].map(([k, v]) => (
              <div key={k}>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#94a3b8', marginBottom: 4 }}>{k}</div>
                <div style={{ fontSize: 15, color: '#1a1a2e', fontWeight: 600 }}>{v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Investments Section ─────────────────────────────────────────────── */}
        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0f2342' }}>Investments ({user.applications.length})</h2>
            <button onClick={openCreateInvestment} style={{ padding: '7px 14px', background: '#0f2342', color: 'white', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              + Add Investment
            </button>
          </div>
          {user.applications.length === 0 ? (
            <p style={{ color: '#94a3b8', fontSize: 14 }}>No investments yet.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>PPM#</th><th>Type</th><th>Units</th><th>Amount</th><th>Status</th><th>Effective</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {user.applications.map(a => (
                    <tr key={a.id}>
                      <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{a.ppmRefNO ?? `#${a.id}`}</td>
                      <td>{a.investorType}</td>
                      <td>{a.numUnits ?? '—'}</td>
                      <td>{a.totalAmount ? `$${a.totalAmount.toLocaleString()}` : '—'}</td>
                      <td>
                        <StatusBadge status={a.status} />
                        {invPendingMap[a.id] && <PendingBadge item={invPendingMap[a.id]} />}
                      </td>
                      <td style={{ color: '#64748b', fontSize: 13 }}>{a.submittedAt ? new Date(a.submittedAt).toLocaleDateString() : '—'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <Link href={`/applications/${a.id}`} style={{ color: '#b8923a', fontWeight: 600, fontSize: 12, textDecoration: 'none' }}>View</Link>
                          <button onClick={() => openEditInvestment(a.id)} style={{ fontSize: 12, color: '#0f2342', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Edit</button>
                          <button onClick={() => setConfirmDeleteInvId(a.id)} style={{ fontSize: 12, color: '#b91c1c', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Redemptions Section ─────────────────────────────────────────────── */}
        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0f2342' }}>Redemptions ({userRedemptions.length})</h2>
            <button onClick={openCreateRedemption} style={{ padding: '7px 14px', background: '#0f2342', color: 'white', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              + Add Redemption
            </button>
          </div>
          {userRedemptions.length === 0 ? (
            <p style={{ color: '#94a3b8', fontSize: 14 }}>No redemptions yet.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr><th>Investor</th><th>Units to Redeem</th><th>Effective Date</th><th>Status</th><th></th></tr>
                </thead>
                <tbody>
                  {userRedemptions.map(r => (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 600 }}>{r.sellingPartnerName || r.email || '—'}</td>
                      <td>{r.unitsToRedeem ?? '—'}</td>
                      <td style={{ fontSize: 13, color: '#64748b' }}>{r.effectiveDate || '—'}</td>
                      <td>
                        <StatusBadge status={r.status} />
                        {redeemPendingMap[r.id] && <PendingBadge item={redeemPendingMap[r.id]} />}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => openEditRedemption(r.id)} style={{ fontSize: 12, color: '#0f2342', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Edit</button>
                          <button onClick={() => deleteRedemption(r.id)} disabled={deletingRedeemId === r.id} style={{ fontSize: 12, color: '#b91c1c', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Distributions Section ───────────────────────────────────────────── */}
        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0f2342' }}>Distributions ({userDistributions.length})</h2>
            <button onClick={openCreateDistribution} style={{ padding: '7px 14px', background: '#0f2342', color: 'white', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              + Add Distribution
            </button>
          </div>
          {userDistributions.length === 0 ? (
            <p style={{ color: '#94a3b8', fontSize: 14 }}>No distributions yet.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr><th>PPM#</th><th>Month</th><th>Net Amount</th><th>Status</th><th>Paid Date</th><th></th></tr>
                </thead>
                <tbody>
                  {userDistributions.map(d => (
                    <tr key={d.id}>
                      <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{d.ppmRefNO ?? '—'}</td>
                      <td style={{ fontSize: 13 }}>{new Date(d.distributionMonth).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</td>
                      <td style={{ fontWeight: 600 }}>${d.totalNetAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td><StatusBadge status={d.paymentStatus} /></td>
                      <td style={{ fontSize: 13, color: '#64748b' }}>{d.paidAt ? new Date(d.paidAt).toLocaleDateString() : '—'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => openEditDistribution(d)} style={{ fontSize: 12, color: '#0f2342', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Edit</button>
                          <button onClick={() => deleteDistribution(d.id)} disabled={deletingDistId === d.id} style={{ fontSize: 12, color: '#b91c1c', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Delete Investment Confirm Modal ─────────────────────────────────── */}
      {confirmDeleteInvId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', borderRadius: 12, padding: 32, width: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: '#0f2342', marginBottom: 10 }}>Delete Investment?</h2>
            <p style={{ fontSize: 14, color: '#64748b', marginBottom: 6 }}>This will permanently delete the investment and all associated data (interest logs, distributions, statements).</p>
            <p style={{ fontSize: 13, color: '#b91c1c', fontWeight: 600, marginBottom: 20 }}>This cannot be undone.</p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button className="btn-secondary" onClick={() => setConfirmDeleteInvId(null)} disabled={deletingInv}>Cancel</button>
              <button onClick={deleteInvestment} disabled={deletingInv} style={{ padding: '10px 20px', background: '#b91c1c', color: 'white', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 14, cursor: deletingInv ? 'not-allowed' : 'pointer', opacity: deletingInv ? 0.7 : 1 }}>
                {deletingInv ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Investment Create / Edit Modal ──────────────────────────────────── */}
      {invModal && (
        <ModalOverlay title={invModal === 'create' ? 'Add Investment' : 'Edit Investment'} onClose={() => setInvModal(null)}>
          <form onSubmit={submitInvestment}>
            <SectionTitle>Application</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
              <FormField label="Investor Type *">
                <select required style={selectStyle} value={invForm.investorType} onChange={e => setInvForm(f => ({ ...f, investorType: e.target.value }))}>
                  {INVESTOR_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </FormField>
              <FormField label="Investment Type">
                <select style={selectStyle} value={invForm.investmentType || ''} onChange={e => setInvForm(f => ({ ...f, investmentType: e.target.value }))}>
                  <option value="">— Select —</option>
                  {INVESTMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </FormField>
              {invForm.investorType !== 'Individual' && (
                <FormField label="Entity Sub-Type">
                  <select style={selectStyle} value={invForm.entitySubType || ''} onChange={e => setInvForm(f => ({ ...f, entitySubType: e.target.value }))}>
                    <option value="">— Select —</option>
                    {ENTITY_SUB_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </FormField>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <FormField label="Effective Date">
                <input type="date" style={inputStyle} value={invForm.effectiveDate || ''} onChange={e => setInvForm(f => ({ ...f, effectiveDate: e.target.value }))} />
              </FormField>
              <FormField label="Submitted / Purchase Date">
                <input type="date" style={inputStyle} value={invForm.submittedAt || ''} onChange={e => setInvForm(f => ({ ...f, submittedAt: e.target.value }))} />
              </FormField>
            </div>

            <SectionTitle>Investor Information</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <FormField label="First Name *"><input required style={inputStyle} value={invForm.firstName} onChange={e => setInvForm(f => ({ ...f, firstName: e.target.value }))} /></FormField>
              <FormField label="Last Name *"><input required style={inputStyle} value={invForm.lastName} onChange={e => setInvForm(f => ({ ...f, lastName: e.target.value }))} /></FormField>
              <FormField label="Phone"><input style={inputStyle} value={invForm.phone || ''} onChange={e => setInvForm(f => ({ ...f, phone: e.target.value }))} /></FormField>
              <FormField label="Day Phone"><input style={inputStyle} value={invForm.dayPhone || ''} onChange={e => setInvForm(f => ({ ...f, dayPhone: e.target.value }))} /></FormField>
              <FormField label="Night Phone"><input style={inputStyle} value={invForm.nightPhone || ''} onChange={e => setInvForm(f => ({ ...f, nightPhone: e.target.value }))} /></FormField>
              <FormField label="Date of Birth"><input type="date" style={inputStyle} value={invForm.dateOfBirth || ''} onChange={e => setInvForm(f => ({ ...f, dateOfBirth: e.target.value }))} /></FormField>
              <FormField label="Street Address"><input style={inputStyle} value={invForm.streetAddress || ''} onChange={e => setInvForm(f => ({ ...f, streetAddress: e.target.value }))} /></FormField>
              <FormField label="City"><input style={inputStyle} value={invForm.city || ''} onChange={e => setInvForm(f => ({ ...f, city: e.target.value }))} /></FormField>
              <FormField label="State"><input style={inputStyle} value={invForm.state || ''} onChange={e => setInvForm(f => ({ ...f, state: e.target.value }))} /></FormField>
              <FormField label="Zip Code"><input style={inputStyle} value={invForm.zipCode || ''} onChange={e => setInvForm(f => ({ ...f, zipCode: e.target.value }))} /></FormField>
              <FormField label="Mailing Address"><input style={inputStyle} value={invForm.mailingAddress || ''} onChange={e => setInvForm(f => ({ ...f, mailingAddress: e.target.value }))} /></FormField>
              <FormField label="Citizenship"><input style={inputStyle} value={invForm.citizenship || ''} onChange={e => setInvForm(f => ({ ...f, citizenship: e.target.value }))} /></FormField>
              <FormField label="Employer"><input style={inputStyle} value={invForm.employer || ''} onChange={e => setInvForm(f => ({ ...f, employer: e.target.value }))} /></FormField>
              <FormField label="Marital Status">
                <select style={selectStyle} value={invForm.maritalStatus || ''} onChange={e => setInvForm(f => ({ ...f, maritalStatus: e.target.value }))}>
                  <option value="">— Select —</option>
                  {MARITAL_STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                </select>
              </FormField>
              <FormField label="Ownership Type"><input style={inputStyle} value={invForm.ownershipType || ''} onChange={e => setInvForm(f => ({ ...f, ownershipType: e.target.value }))} /></FormField>
              {invForm.investorType === 'Individual' && (
                <FormField label="SSN (leave blank to keep)">
                  <input style={inputStyle} value={invForm.ssNumber || ''} placeholder={invSSNMasked || 'Enter SSN'} onChange={e => setInvForm(f => ({ ...f, ssNumber: e.target.value }))} autoComplete="off" />
                </FormField>
              )}
            </div>

            {invForm.investorType === 'Individual' && invForm.maritalStatus?.toLowerCase() === 'married' && (
              <>
                <SectionTitle>Spouse / Joint Tenant</SectionTitle>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <FormField label="Spouse Full Name"><input style={inputStyle} value={invForm.spouseFullName || ''} onChange={e => setInvForm(f => ({ ...f, spouseFullName: e.target.value }))} /></FormField>
                  <FormField label="Spouse Email"><input type="email" style={inputStyle} value={invForm.spouseEmail || ''} onChange={e => setInvForm(f => ({ ...f, spouseEmail: e.target.value }))} /></FormField>
                  <FormField label="Spouse Date of Birth"><input type="date" style={inputStyle} value={invForm.spouseDateOfBirth || ''} onChange={e => setInvForm(f => ({ ...f, spouseDateOfBirth: e.target.value }))} /></FormField>
                  <FormField label="Spouse SSN (leave blank to keep)">
                    <input style={inputStyle} value={invForm.spouseSSN || ''} placeholder={invSpouseSSNMasked || 'Enter Spouse SSN'} onChange={e => setInvForm(f => ({ ...f, spouseSSN: e.target.value }))} autoComplete="off" />
                  </FormField>
                </div>
              </>
            )}

            {(invForm.investorType === 'IRA' || !!invForm.custodianName) && (
              <>
                <SectionTitle>Custodian</SectionTitle>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <FormField label="Custodian Name"><input style={inputStyle} value={invForm.custodianName || ''} onChange={e => setInvForm(f => ({ ...f, custodianName: e.target.value }))} /></FormField>
                  <FormField label="Custodian Account"><input style={inputStyle} value={invForm.custodianAcct || ''} onChange={e => setInvForm(f => ({ ...f, custodianAcct: e.target.value }))} /></FormField>
                  <FormField label="Custodian Phone"><input style={inputStyle} value={invForm.custodianPhone || ''} onChange={e => setInvForm(f => ({ ...f, custodianPhone: e.target.value }))} /></FormField>
                  <FormField label="Custodian Email"><input type="email" style={inputStyle} value={invForm.custodianEmail || ''} onChange={e => setInvForm(f => ({ ...f, custodianEmail: e.target.value }))} /></FormField>
                </div>
              </>
            )}

            {invForm.investorType !== 'Individual' && (
              <>
                <SectionTitle>Entity Information</SectionTitle>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <FormField label="Entity Name"><input style={inputStyle} value={invForm.entityName || ''} onChange={e => setInvForm(f => ({ ...f, entityName: e.target.value }))} /></FormField>
                  <FormField label="EIN"><input style={inputStyle} value={invForm.ein || ''} onChange={e => setInvForm(f => ({ ...f, ein: e.target.value }))} /></FormField>
                  <FormField label="State of Formation"><input style={inputStyle} value={invForm.stateFormation || ''} onChange={e => setInvForm(f => ({ ...f, stateFormation: e.target.value }))} /></FormField>
                  <FormField label="Signatory Name"><input style={inputStyle} value={invForm.signatoryName || ''} onChange={e => setInvForm(f => ({ ...f, signatoryName: e.target.value }))} /></FormField>
                  <FormField label="Signatory Title"><input style={inputStyle} value={invForm.signatoryTitle || ''} onChange={e => setInvForm(f => ({ ...f, signatoryTitle: e.target.value }))} /></FormField>
                </div>
              </>
            )}

            <SectionTitle>Identity Documents</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <FormField label="Driving License No (leave blank to keep)">
                <input style={inputStyle} value={invForm.drivingLicenseNo || ''} placeholder={invDLMasked || 'Enter DL number to update'} onChange={e => setInvForm(f => ({ ...f, drivingLicenseNo: e.target.value }))} autoComplete="off" />
              </FormField>
              <FormField label="Driving License State">
                <input style={inputStyle} value={invForm.drivingLicenseState || ''} onChange={e => setInvForm(f => ({ ...f, drivingLicenseState: e.target.value }))} />
              </FormField>
              <FormField label="Tax Certificate No (leave blank to keep)">
                <input style={inputStyle} value={invForm.taxCertificateNo || ''} placeholder={invTaxCertMasked || 'Enter Tax Cert number to update'} onChange={e => setInvForm(f => ({ ...f, taxCertificateNo: e.target.value }))} autoComplete="off" />
              </FormField>
            </div>

            <SectionTitle>Investment Details</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
              <FormField label="Units *"><input required type="number" min={1} style={inputStyle} value={invForm.numUnits || ''} onChange={e => setInvForm(f => ({ ...f, numUnits: Number(e.target.value) }))} /></FormField>
              <FormField label="Total Amount ($) *"><input required type="number" min={0} step="0.01" style={inputStyle} value={invForm.totalAmount || ''} onChange={e => setInvForm(f => ({ ...f, totalAmount: Number(e.target.value) }))} /></FormField>
              <FormField label="PPM Ref# (auto if blank)"><input type="number" style={inputStyle} value={invForm.ppmRefNO ?? ''} onChange={e => setInvForm(f => ({ ...f, ppmRefNO: e.target.value ? Number(e.target.value) : undefined }))} /></FormField>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <FormField label="Payment Method">
                <select style={selectStyle} value={invForm.paymentMethod || ''} onChange={e => setInvForm(f => ({ ...f, paymentMethod: e.target.value }))}>
                  <option value="">— Select —</option>
                  {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </FormField>
              <FormField label="Distribution Preference">
                <select style={selectStyle} value={invForm.distributionPreference || ''} onChange={e => setInvForm(f => ({ ...f, distributionPreference: e.target.value }))}>
                  <option value="">— Select —</option>
                  {DIST_PREFS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </FormField>
            </div>

            <SectionTitle>Bank Details</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <FormField label="Bank Name"><input style={inputStyle} value={invForm.bankName || ''} onChange={e => setInvForm(f => ({ ...f, bankName: e.target.value }))} /></FormField>
              <FormField label="Account Holder"><input style={inputStyle} value={invForm.accHolder || ''} onChange={e => setInvForm(f => ({ ...f, accHolder: e.target.value }))} /></FormField>
              <FormField label="Routing Number"><input style={inputStyle} value={invForm.routingNumber || ''} onChange={e => setInvForm(f => ({ ...f, routingNumber: e.target.value }))} /></FormField>
              <FormField label="Account Number"><input style={inputStyle} value={invForm.accNumber || ''} onChange={e => setInvForm(f => ({ ...f, accNumber: e.target.value }))} /></FormField>
            </div>

            {invMsg && <p style={{ color: '#b91c1c', fontSize: 13, marginBottom: 12 }}>{invMsg}</p>}
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button type="button" className="btn-secondary" onClick={() => setInvModal(null)} disabled={invSubmitting}>Cancel</button>
              <button type="submit" disabled={invSubmitting} style={{ padding: '10px 22px', background: '#0f2342', color: 'white', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 14, cursor: invSubmitting ? 'not-allowed' : 'pointer', opacity: invSubmitting ? 0.7 : 1 }}>
                {invSubmitting ? 'Saving...' : isSuperAdmin
                  ? (invModal === 'create' ? 'Create Investment' : 'Save Changes')
                  : (invModal === 'create' ? 'Submit for Approval' : 'Submit Change for Approval')}
              </button>
            </div>
          </form>
        </ModalOverlay>
      )}

      {/* ── Redemption Create / Edit Modal ──────────────────────────────────── */}
      {redeemModal && (
        <ModalOverlay title={redeemModal === 'create' ? 'Add Redemption' : 'Edit Redemption'} onClose={() => setRedeemModal(null)}>
          <form onSubmit={submitRedemption}>
            <SectionTitle>Investment Tranche</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <FormField label="Tranche Investment *">
                <select required style={selectStyle} value={redeemForm.trancheApplicationId ?? ''} onChange={e => onTrancheChange(e.target.value)}>
                  <option value="">— Select —</option>
                  {user.applications.map(a => (
                    <option key={a.id} value={a.id}>
                      PPM#{a.ppmRefNO ?? a.id} – {a.numUnits} units {a.totalAmount ? `($${a.totalAmount.toLocaleString()})` : ''}
                    </option>
                  ))}
                </select>
              </FormField>
              <div>
                <label style={labelStyle}>Investor Type</label>
                <div style={readOnlyBoxStyle}>{redeemForm.investorType || '—'}</div>
              </div>
            </div>

            {trancheLoading && <p style={{ fontSize: 13, color: '#64748b', marginBottom: 12 }}>Loading investment details…</p>}

            {redeemForm.trancheApplicationId && !trancheLoading && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                  <div>
                    <label style={labelStyle}>Total Units Owned</label>
                    <div style={readOnlyBoxStyle}>{redeemForm.totalUnitsOwned || '—'}</div>
                  </div>
                  <div>
                    <label style={labelStyle}>Status</label>
                    <div style={readOnlyBoxStyle}>{redeemForm.status || 'Active'}</div>
                  </div>
                </div>

                <SectionTitle>Bank Details</SectionTitle>
                <BankDetailsPanel
                  bankName={trancheDetail?.investment?.bankName}
                  accHolder={trancheDetail?.investment?.accHolder}
                  accNumber={trancheDetail?.investment?.accNumber}
                  routingNumber={trancheDetail?.investment?.routingNumber}
                />

                <SectionTitle>Redemption Details</SectionTitle>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                  <FormField label="Units to Redeem *">
                    <input
                      required
                      type="number"
                      min={1}
                      max={trancheDetail?.investment?.numUnits ?? undefined}
                      style={inputStyle}
                      value={redeemForm.unitsToRedeem || ''}
                      onChange={e => setRedeemForm(f => ({ ...f, unitsToRedeem: e.target.value }))}
                    />
                  </FormField>
                  <FormField label="Effective Date *">
                    <input
                      required
                      type="date"
                      style={inputStyle}
                      value={redeemForm.effectiveDate || ''}
                      onChange={e => setRedeemForm(f => ({ ...f, effectiveDate: e.target.value }))}
                    />
                  </FormField>
                </div>

                <SectionTitle>Redemption Summary</SectionTitle>
                <RedemptionSummaryPanel calc={redeemCalc} />
              </>
            )}

            {redeemMsg && <p style={{ color: '#b91c1c', fontSize: 13, marginBottom: 12 }}>{redeemMsg}</p>}
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button type="button" className="btn-secondary" onClick={() => setRedeemModal(null)} disabled={redeemSubmitting}>Cancel</button>
              <button type="submit" disabled={redeemSubmitting || !redeemForm.trancheApplicationId} style={{ padding: '10px 22px', background: '#0f2342', color: 'white', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 14, cursor: redeemSubmitting ? 'not-allowed' : 'pointer', opacity: redeemSubmitting ? 0.7 : 1 }}>
                {redeemSubmitting ? 'Saving...' : isSuperAdmin
                  ? (redeemModal === 'create' ? 'Create Redemption' : 'Save Changes')
                  : (redeemModal === 'create' ? 'Submit for Approval' : 'Submit Change for Approval')}
              </button>
            </div>
          </form>
        </ModalOverlay>
      )}

      {/* ── Distribution Create / Edit Modal ────────────────────────────────── */}
      {distModal && (
        <ModalOverlay title={distModal === 'create' ? 'Add Distribution' : 'Edit Distribution'} onClose={() => setDistModal(null)}>
          <form onSubmit={submitDistribution}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <FormField label="Investment">
                <select required style={selectStyle} value={distForm.applicationId || ''} onChange={e => setDistForm(f => ({ ...f, applicationId: Number(e.target.value) }))}>
                  <option value="">— Select Investment —</option>
                  {user.applications.map(a => (
                    <option key={a.id} value={a.id}>PPM#{a.ppmRefNO ?? a.id}{a.totalAmount ? ` – $${a.totalAmount.toLocaleString()}` : ''}</option>
                  ))}
                </select>
              </FormField>
              <FormField label="Distribution Month *">
                <input required type="month" style={inputStyle} value={distForm.distributionMonth.length >= 7 ? distForm.distributionMonth.slice(0, 7) : distForm.distributionMonth} onChange={e => setDistForm(f => ({ ...f, distributionMonth: e.target.value }))} />
              </FormField>
              <FormField label="Total Net Amount ($) *">
                <input required type="number" min={0} step="0.01" style={inputStyle} value={distForm.totalNetAmount || ''} onChange={e => setDistForm(f => ({ ...f, totalNetAmount: Number(e.target.value) }))} />
              </FormField>
              <FormField label="Payment Status *">
                <select required style={selectStyle} value={distForm.paymentStatus} onChange={e => setDistForm(f => ({ ...f, paymentStatus: e.target.value }))}>
                  {PAYMENT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </FormField>
              {distForm.paymentStatus === 'Paid' && (
                <FormField label="Paid Date">
                  <input type="date" style={inputStyle} value={distForm.paidAt || ''} onChange={e => setDistForm(f => ({ ...f, paidAt: e.target.value }))} />
                </FormField>
              )}
            </div>
            <SectionTitle>Bank Snapshot</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <FormField label="Bank Name"><input style={inputStyle} value={distForm.bankName || ''} onChange={e => setDistForm(f => ({ ...f, bankName: e.target.value }))} /></FormField>
              <FormField label="Account Holder"><input style={inputStyle} value={distForm.bankAccountHolderName || ''} onChange={e => setDistForm(f => ({ ...f, bankAccountHolderName: e.target.value }))} /></FormField>
              <FormField label="Routing Number"><input style={inputStyle} value={distForm.bankRoutingNumber || ''} onChange={e => setDistForm(f => ({ ...f, bankRoutingNumber: e.target.value }))} /></FormField>
              <FormField label="Account Number"><input style={inputStyle} value={distForm.bankAccountNumber || ''} onChange={e => setDistForm(f => ({ ...f, bankAccountNumber: e.target.value }))} /></FormField>
            </div>

            {distMsg && <p style={{ color: '#b91c1c', fontSize: 13, marginBottom: 12 }}>{distMsg}</p>}
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button type="button" className="btn-secondary" onClick={() => setDistModal(null)} disabled={distSubmitting}>Cancel</button>
              <button type="submit" disabled={distSubmitting} style={{ padding: '10px 22px', background: '#0f2342', color: 'white', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 14, cursor: distSubmitting ? 'not-allowed' : 'pointer', opacity: distSubmitting ? 0.7 : 1 }}>
                {distSubmitting ? 'Saving...' : isSuperAdmin
                  ? (distModal === 'create' ? 'Create Distribution' : 'Save Changes')
                  : (distModal === 'create' ? 'Submit for Approval' : 'Submit Change for Approval')}
              </button>
            </div>
          </form>
        </ModalOverlay>
      )}
    </AdminLayout>
  );
}
