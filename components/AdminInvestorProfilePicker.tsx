"use client";

import { useCallback, useEffect, useState } from "react";
import {
  adminApi,
  type InvestorEntityProfile,
  type AddInvestorEntityProfileRequest,
  type UpdateInvestorEntityProfileRequest,
} from "@/lib/api";

// InvestorType/EntitySubType are raw numeric enum values on the wire (no
// JsonStringEnumConverter registered on the API) -- see eInvestorType/eEntitySubType.
const INVESTOR_TYPES = [
  { value: 1, label: "Individual" },
  { value: 2, label: "Entity" },
  { value: 3, label: "IRA" },
  { value: 4, label: "Trust" },
];
const ENTITY_SUB_TYPES = [
  { value: 1, label: "LLC" },
  { value: 2, label: "Corporation" },
  { value: 3, label: "LP_GP" },
  { value: 4, label: "PensionFund" },
  { value: 5, label: "BankBroker" },
  { value: 6, label: "Other" },
];
const MARITAL_STATUSES = ["single", "married", "widowed", "divorced"];

const inputStyle = {
  width: "100%",
  padding: "8px 11px",
  border: "1.5px solid #e2e8f0",
  borderRadius: 6,
  fontSize: 13,
  boxSizing: "border-box" as const,
};
const labelStyle = {
  fontSize: 11,
  fontWeight: 700 as const,
  color: "#475569",
  display: "block" as const,
  marginBottom: 3,
  textTransform: "uppercase" as const,
  letterSpacing: "0.04em",
};
const selectStyle = { ...inputStyle, background: "white" };

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

type ProfileForm = Omit<AddInvestorEntityProfileRequest, "investorType" | "entitySubType">;

const emptyForm: ProfileForm = {
  firstName: "",
  lastName: "",
  ssNumber: "",
  dateOfBirth: "",
  citizenship: "",
  maritalStatus: "",
  spouseFullName: "",
  spouseEmail: "",
  spouseSSN: "",
  spouseDateOfBirth: "",
  ownershipType: "",
  email: "",
  phone: "",
  streetAddress: "",
  city: "",
  state: "",
  zipCode: "",
  mailingAddress: "",
  entityName: "",
  ein: "",
  stateFormation: "",
  signatoryName: "",
  signatoryTitle: "",
  custodianName: "",
  custodianAcct: "",
  custodianPhone: "",
  custodianEmail: "",
  drivingLicenseNo: "",
  drivingLicenseState: "",
  drivingLicensePaths: "",
  taxCertificateNo: "",
  taxCertificatePaths: "",
  employer: "",
  day: "",
  night: "",
};

function profileToForm(p: InvestorEntityProfile): ProfileForm {
  return {
    firstName: p.firstName ?? "",
    lastName: p.lastName ?? "",
    ssNumber: "",
    dateOfBirth: p.dateOfBirth ?? "",
    citizenship: p.citizenship ?? "",
    maritalStatus: p.maritalStatus ?? "",
    spouseFullName: p.spouseFullName ?? "",
    spouseEmail: p.spouseEmail ?? "",
    spouseSSN: "",
    spouseDateOfBirth: p.spouseDateOfBirth ?? "",
    ownershipType: p.ownershipType ?? "",
    email: p.email ?? "",
    phone: p.phone ?? "",
    streetAddress: p.streetAddress ?? "",
    city: p.city ?? "",
    state: p.state ?? "",
    zipCode: p.zipCode ?? "",
    mailingAddress: p.mailingAddress ?? "",
    entityName: p.entityName ?? "",
    ein: "",
    stateFormation: p.stateFormation ?? "",
    signatoryName: p.signatoryName ?? "",
    signatoryTitle: p.signatoryTitle ?? "",
    custodianName: p.custodianName ?? "",
    custodianAcct: p.custodianAcct ?? "",
    custodianPhone: p.custodianPhone ?? "",
    custodianEmail: p.custodianEmail ?? "",
    drivingLicenseNo: "",
    drivingLicenseState: p.drivingLicenseState ?? "",
    drivingLicensePaths: p.drivingLicensePaths ?? "",
    taxCertificateNo: p.taxCertificateNo ?? "",
    taxCertificatePaths: p.taxCertificatePaths ?? "",
    employer: p.employer ?? "",
    day: p.day ?? "",
    night: p.night ?? "",
  };
}

function maskedTail(value?: string | null) {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 4 ? `••••${digits.slice(-4)}` : digits;
}

interface AdminInvestorProfilePickerProps {
  userId: number;
  isSuperAdmin: boolean;
  selectedId: number | null;
  onSelect: (profileId: number, profile: InvestorEntityProfile) => void;
  description?: string;
}

export function AdminInvestorProfilePicker({
  userId,
  isSuperAdmin,
  selectedId,
  onSelect,
  description = "Select the investor profile this application is filed under, or add a new one.",
}: AdminInvestorProfilePickerProps) {
  const [profiles, setProfiles] = useState<InvestorEntityProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [form, setForm] = useState<ProfileForm>(emptyForm);
  const [formType, setFormType] = useState(1);
  const [formEntitySubType, setFormEntitySubType] = useState<number | null>(null);
  const [busyAction, setBusyAction] = useState<{ id: number; action: "primary" | "deactivate" | "reactivate" } | null>(null);
  const [showDeactivated, setShowDeactivated] = useState(false);
  const [isLoadingDeactivated, setIsLoadingDeactivated] = useState(false);
  const [deactivatedProfiles, setDeactivatedProfiles] = useState<InvestorEntityProfile[]>([]);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await adminApi.getUserInvestorProfiles(userId);
      const list = res.success && res.data ? res.data : [];
      setProfiles(list);
      if (list.length === 0) setIsAdding(true);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const isIndividual = formType === 1;
  const isMarried = form.maritalStatus?.toLowerCase() === "married";
  const isIRA = formType === 3;
  const editingProfile = editingId ? profiles.find((p) => p.id === editingId) : null;

  const isFormValid = isIndividual
    ? !!form.firstName && !!form.lastName
    : !!form.entityName;

  const resetForm = () => {
    setForm(emptyForm);
    setFormType(1);
    setFormEntitySubType(null);
    setIsAdding(false);
    setEditingId(null);
  };

  const startAdd = () => {
    setForm(emptyForm);
    setFormType(1);
    setFormEntitySubType(null);
    setEditingId(null);
    setIsAdding(true);
    setMsg(null);
  };

  const startEdit = (profile: InvestorEntityProfile) => {
    setForm(profileToForm(profile));
    setFormType(profile.investorType);
    setFormEntitySubType(profile.entitySubType ?? null);
    setEditingId(profile.id);
    setIsAdding(false);
    setMsg(null);
  };

  const handleSave = async () => {
    if (!isFormValid) return;
    setIsSaving(true);
    setMsg(null);
    try {
      if (editingId) {
        const dto: UpdateInvestorEntityProfileRequest = { ...form };
        const res = await adminApi.updateUserInvestorProfile(userId, editingId, dto);
        if (!res.success) throw new Error(res.message || "Failed to save investor profile");
        resetForm();
        await load();
        if (isSuperAdmin && res.data) onSelect(res.data.id, res.data);
        setMsg({
          text: isSuperAdmin ? "Investor profile updated." : res.message || "Submitted for approval.",
          ok: true,
        });
      } else {
        const dto: AddInvestorEntityProfileRequest = {
          ...form,
          investorType: formType,
          entitySubType: formEntitySubType,
          setPrimary: profiles.length === 0,
        };
        const res = await adminApi.addUserInvestorProfile(userId, dto);
        if (!res.success) throw new Error(res.message || "Failed to save investor profile");
        resetForm();
        await load();
        if (isSuperAdmin && res.data) onSelect(res.data.id, res.data);
        setMsg({
          text: isSuperAdmin ? "Investor profile saved." : res.message || "Submitted for approval.",
          ok: true,
        });
      }
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : "Failed to save investor profile", ok: false });
    } finally {
      setIsSaving(false);
    }
  };

  const loadDeactivated = useCallback(async () => {
    setIsLoadingDeactivated(true);
    try {
      const res = await adminApi.getUserDeactivatedInvestorProfiles(userId);
      setDeactivatedProfiles(res.success && res.data ? res.data : []);
    } finally {
      setIsLoadingDeactivated(false);
    }
  }, [userId]);

  const toggleShowDeactivated = () => {
    const next = !showDeactivated;
    setShowDeactivated(next);
    if (next) loadDeactivated();
  };

  const handleSetPrimary = async (id: number) => {
    setBusyAction({ id, action: "primary" });
    setMsg(null);
    try {
      const res = await adminApi.setUserInvestorProfilePrimary(userId, id);
      if (!res.success) throw new Error(res.message || "Failed to update primary profile");
      if (isSuperAdmin) await load();
      setMsg({
        text: isSuperAdmin ? "Primary profile updated." : res.message || "Submitted for approval.",
        ok: true,
      });
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : "Failed to update primary profile", ok: false });
    } finally {
      setBusyAction(null);
    }
  };

  const handleDeactivate = async (id: number) => {
    setBusyAction({ id, action: "deactivate" });
    setMsg(null);
    try {
      const res = await adminApi.deactivateUserInvestorProfile(userId, id);
      if (!res.success) throw new Error(res.message || "Failed to deactivate investor profile");
      if (isSuperAdmin) {
        await load();
        if (showDeactivated) await loadDeactivated();
      }
      setMsg({
        text: isSuperAdmin ? "Investor profile deactivated." : res.message || "Submitted for approval.",
        ok: true,
      });
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : "Failed to deactivate investor profile", ok: false });
    } finally {
      setBusyAction(null);
    }
  };

  const handleReactivate = async (id: number) => {
    setBusyAction({ id, action: "reactivate" });
    setMsg(null);
    try {
      const res = await adminApi.reactivateUserInvestorProfile(userId, id);
      if (!res.success) throw new Error(res.message || "Failed to reactivate investor profile");
      if (isSuperAdmin) {
        await load();
        await loadDeactivated();
      }
      setMsg({
        text: isSuperAdmin ? "Investor profile reactivated." : res.message || "Submitted for approval.",
        ok: true,
      });
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : "Failed to reactivate investor profile", ok: false });
    } finally {
      setBusyAction(null);
    }
  };

  if (isLoading) {
    return <p style={{ fontSize: 13, color: "#64748b" }}>Loading investor profiles…</p>;
  }

  const formBlock = (isAdding || editingId) ? (
    <div style={{ padding: 14, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, marginTop: 8 }}>
      {!editingId && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <FormField label="Investor Type *">
            <select required style={selectStyle} value={formType} onChange={(e) => setFormType(Number(e.target.value))}>
              {INVESTOR_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </FormField>
          {formType !== 1 && (
            <FormField label="Entity Sub-Type">
              <select style={selectStyle} value={formEntitySubType ?? ""} onChange={(e) => setFormEntitySubType(e.target.value ? Number(e.target.value) : null)}>
                <option value="">— Select —</option>
                {ENTITY_SUB_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </FormField>
          )}
        </div>
      )}

      {editingProfile?.isLocked && (
        <p style={{ fontSize: 12, color: "#92400e", marginBottom: 10 }}>
          This profile has been used in a submitted application. Legal identity fields (name, SSN, entity name, EIN, etc.) can still be corrected here — admin edits aren&apos;t locked the way investor self-service edits are.
        </p>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        {isIndividual ? (
          <>
            <FormField label="First Name *"><input required style={inputStyle} value={form.firstName || ""} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} /></FormField>
            <FormField label="Last Name *"><input required style={inputStyle} value={form.lastName || ""} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} /></FormField>
            <FormField label="SSN (leave blank to keep)">
              <input style={inputStyle} value={form.ssNumber || ""} placeholder={editingProfile ? maskedTail(editingProfile.ssNumber) || "Enter new SSN to update" : ""} onChange={(e) => setForm((f) => ({ ...f, ssNumber: e.target.value }))} autoComplete="off" />
            </FormField>
            <FormField label="Date of Birth"><input type="date" style={inputStyle} value={form.dateOfBirth || ""} onChange={(e) => setForm((f) => ({ ...f, dateOfBirth: e.target.value }))} /></FormField>
            <FormField label="Citizenship"><input style={inputStyle} value={form.citizenship || ""} onChange={(e) => setForm((f) => ({ ...f, citizenship: e.target.value }))} /></FormField>
            <FormField label="Marital Status">
              <select style={selectStyle} value={form.maritalStatus || ""} onChange={(e) => setForm((f) => ({ ...f, maritalStatus: e.target.value }))}>
                <option value="">— Select —</option>
                {MARITAL_STATUSES.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
              </select>
            </FormField>
            <FormField label="Ownership Type"><input style={inputStyle} value={form.ownershipType || ""} onChange={(e) => setForm((f) => ({ ...f, ownershipType: e.target.value }))} /></FormField>
          </>
        ) : (
          <>
            <FormField label="Entity Name *"><input required style={inputStyle} value={form.entityName || ""} onChange={(e) => setForm((f) => ({ ...f, entityName: e.target.value }))} /></FormField>
            <FormField label="EIN (leave blank to keep)">
              <input style={inputStyle} value={form.ein || ""} placeholder={editingProfile ? maskedTail(editingProfile.ein) || "Enter EIN to update" : ""} onChange={(e) => setForm((f) => ({ ...f, ein: e.target.value }))} autoComplete="off" />
            </FormField>
            <FormField label="State of Formation"><input style={inputStyle} value={form.stateFormation || ""} onChange={(e) => setForm((f) => ({ ...f, stateFormation: e.target.value }))} /></FormField>
            <FormField label="Signatory Name"><input style={inputStyle} value={form.signatoryName || ""} onChange={(e) => setForm((f) => ({ ...f, signatoryName: e.target.value }))} /></FormField>
            <FormField label="Signatory Title"><input style={inputStyle} value={form.signatoryTitle || ""} onChange={(e) => setForm((f) => ({ ...f, signatoryTitle: e.target.value }))} /></FormField>
          </>
        )}
      </div>

      {isIndividual && isMarried && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <FormField label="Spouse Full Name"><input style={inputStyle} value={form.spouseFullName || ""} onChange={(e) => setForm((f) => ({ ...f, spouseFullName: e.target.value }))} /></FormField>
          <FormField label="Spouse Email"><input type="email" style={inputStyle} value={form.spouseEmail || ""} onChange={(e) => setForm((f) => ({ ...f, spouseEmail: e.target.value }))} /></FormField>
          <FormField label="Spouse Date of Birth"><input type="date" style={inputStyle} value={form.spouseDateOfBirth || ""} onChange={(e) => setForm((f) => ({ ...f, spouseDateOfBirth: e.target.value }))} /></FormField>
          <FormField label="Spouse SSN (leave blank to keep)">
            <input style={inputStyle} value={form.spouseSSN || ""} placeholder={editingProfile ? maskedTail(editingProfile.spouseSSN) || "Enter new Spouse SSN to update" : ""} onChange={(e) => setForm((f) => ({ ...f, spouseSSN: e.target.value }))} autoComplete="off" />
          </FormField>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <FormField label="Email"><input type="email" style={inputStyle} value={form.email || ""} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></FormField>
        <FormField label="Phone"><input style={inputStyle} value={form.phone || ""} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} /></FormField>
        <FormField label="Day Phone"><input style={inputStyle} value={form.day || ""} onChange={(e) => setForm((f) => ({ ...f, day: e.target.value }))} /></FormField>
        <FormField label="Night Phone"><input style={inputStyle} value={form.night || ""} onChange={(e) => setForm((f) => ({ ...f, night: e.target.value }))} /></FormField>
        <FormField label="Street Address"><input style={inputStyle} value={form.streetAddress || ""} onChange={(e) => setForm((f) => ({ ...f, streetAddress: e.target.value }))} /></FormField>
        <FormField label="City"><input style={inputStyle} value={form.city || ""} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} /></FormField>
        <FormField label="State"><input style={inputStyle} value={form.state || ""} onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))} /></FormField>
        <FormField label="Zip Code"><input style={inputStyle} value={form.zipCode || ""} onChange={(e) => setForm((f) => ({ ...f, zipCode: e.target.value }))} /></FormField>
        <FormField label="Mailing Address"><input style={inputStyle} value={form.mailingAddress || ""} onChange={(e) => setForm((f) => ({ ...f, mailingAddress: e.target.value }))} /></FormField>
        <FormField label="Employer"><input style={inputStyle} value={form.employer || ""} onChange={(e) => setForm((f) => ({ ...f, employer: e.target.value }))} /></FormField>
      </div>

      {(isIRA || form.custodianName) && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <FormField label="Custodian Name"><input style={inputStyle} value={form.custodianName || ""} onChange={(e) => setForm((f) => ({ ...f, custodianName: e.target.value }))} /></FormField>
          <FormField label="Custodian Account"><input style={inputStyle} value={form.custodianAcct || ""} onChange={(e) => setForm((f) => ({ ...f, custodianAcct: e.target.value }))} /></FormField>
          <FormField label="Custodian Phone"><input style={inputStyle} value={form.custodianPhone || ""} onChange={(e) => setForm((f) => ({ ...f, custodianPhone: e.target.value }))} /></FormField>
          <FormField label="Custodian Email"><input type="email" style={inputStyle} value={form.custodianEmail || ""} onChange={(e) => setForm((f) => ({ ...f, custodianEmail: e.target.value }))} /></FormField>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <FormField label="Driving License No (leave blank to keep)">
          <input style={inputStyle} value={form.drivingLicenseNo || ""} placeholder={editingProfile ? maskedTail(editingProfile.drivingLicenseNo) || "Enter new DL number to update" : ""} onChange={(e) => setForm((f) => ({ ...f, drivingLicenseNo: e.target.value }))} autoComplete="off" />
        </FormField>
        <FormField label="Driving License State"><input style={inputStyle} value={form.drivingLicenseState || ""} onChange={(e) => setForm((f) => ({ ...f, drivingLicenseState: e.target.value }))} /></FormField>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          disabled={!isFormValid || isSaving}
          onClick={handleSave}
          style={{
            padding: "8px 16px",
            background: "#0f2342",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            cursor: !isFormValid || isSaving ? "not-allowed" : "pointer",
            opacity: !isFormValid || isSaving ? 0.6 : 1,
          }}
        >
          {isSaving ? "Saving..." : isSuperAdmin ? (editingId ? "Save Changes" : "Save Profile") : "Submit for Approval"}
        </button>
        {(profiles.length > 0) && (
          <button
            type="button"
            onClick={resetForm}
            style={{ padding: "8px 16px", background: "white", color: "#475569", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  ) : null;

  return (
    <div>
      <p style={{ fontSize: 12, color: "#64748b", marginBottom: 10 }}>{description}</p>

      {msg && (
        <div style={{ fontSize: 12, color: msg.ok ? "#166534" : "#b91c1c", marginBottom: 10 }}>
          {msg.text}
        </div>
      )}

      {profiles.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
          {profiles.map((p) => (
            <div key={p.id}>
              <div
                onClick={() => onSelect(p.id, p)}
                style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                padding: "10px 12px",
                background: selectedId === p.id ? "#eff6ff" : "#f8fafc",
                border: selectedId === p.id ? "1.5px solid #93c5fd" : "1px solid #e2e8f0",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              <input
                type="radio"
                checked={selectedId === p.id}
                onChange={() => onSelect(p.id, p)}
                style={{ margin: "3px 0 0" }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#1a1a2e" }}>{p.displayName}</span>
                  {p.isPrimary && (
                    <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", padding: "2px 7px", borderRadius: 10, background: "#0f2342", color: "#fff" }}>
                      Primary
                    </span>
                  )}
                  {p.isLocked && (
                    <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", padding: "2px 7px", borderRadius: 10, background: "#f1f5f9", color: "#64748b", border: "1px solid #e2e8f0" }}>
                      In use
                    </span>
                  )}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px", fontSize: 12, color: "#334155" }}>
                  <div>
                    <span style={{ color: "#94a3b8" }}>{p.investorType === 1 ? "SSN: " : "EIN: "}</span>
                    <span style={{ fontFamily: "monospace" }}>{maskedTail(p.investorType === 1 ? p.ssNumber : p.ein) ?? "—"}</span>
                  </div>
                  <div>
                    <span style={{ color: "#94a3b8" }}>Phone: </span>
                    {p.phone || "—"}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, flexShrink: 0, marginTop: 3, flexWrap: "wrap", maxWidth: 160, justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (editingId === p.id) {
                      resetForm();
                    } else {
                      onSelect(p.id, p);
                      startEdit(p);
                    }
                  }}
                  style={{ background: "none", border: "none", color: "#2563eb", fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0 }}
                >
                  {editingId === p.id ? "Cancel" : "Edit"}
                </button>
                {!p.isPrimary && (
                  <button
                    type="button"
                    disabled={busyAction?.id === p.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSetPrimary(p.id);
                    }}
                    style={{ background: "none", border: "none", color: "#2563eb", fontSize: 12, fontWeight: 600, cursor: busyAction?.id === p.id ? "not-allowed" : "pointer", opacity: busyAction?.id === p.id ? 0.5 : 1, padding: 0 }}
                  >
                    {busyAction?.id === p.id && busyAction.action === "primary" ? "Updating…" : "Make primary"}
                  </button>
                )}
                <button
                  type="button"
                  disabled={busyAction?.id === p.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeactivate(p.id);
                  }}
                  style={{ background: "none", border: "none", color: "#b91c1c", fontSize: 12, fontWeight: 600, cursor: busyAction?.id === p.id ? "not-allowed" : "pointer", opacity: busyAction?.id === p.id ? 0.5 : 1, padding: 0 }}
                >
                  {busyAction?.id === p.id && busyAction.action === "deactivate" ? "Deactivating…" : "Deactivate"}
                </button>
              </div>
            </div>
            {editingId === p.id && formBlock}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: showDeactivated ? 10 : 0 }}>
        {!isAdding && !editingId && (
          <button type="button" onClick={startAdd} style={{ background: "none", border: "none", color: "#2563eb", fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0 }}>
            + Add another investor profile
          </button>
        )}
        <button type="button" onClick={toggleShowDeactivated} style={{ background: "none", border: "none", color: "#64748b", fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0 }}>
          {showDeactivated ? "Hide deactivated profiles" : "Show deactivated profiles"}
        </button>
      </div>

      {showDeactivated && (
        <div style={{ marginTop: 10, marginBottom: 12 }}>
          {isLoadingDeactivated ? (
            <p style={{ fontSize: 13, color: "#64748b" }}>Loading…</p>
          ) : deactivatedProfiles.length === 0 ? (
            <p style={{ fontSize: 13, color: "#94a3b8" }}>No deactivated profiles.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {deactivatedProfiles.map((p) => (
                <div key={p.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, opacity: 0.75 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#1a1a2e" }}>{p.displayName}</span>
                  </div>
                  <button
                    type="button"
                    disabled={busyAction?.id === p.id}
                    onClick={() => handleReactivate(p.id)}
                    style={{ background: "none", border: "none", color: "#2563eb", fontSize: 12, fontWeight: 600, cursor: busyAction?.id === p.id ? "not-allowed" : "pointer", opacity: busyAction?.id === p.id ? 0.5 : 1, padding: 0, flexShrink: 0, marginTop: 3 }}
                  >
                    {busyAction?.id === p.id && busyAction.action === "reactivate" ? "Reactivating…" : "Reactivate"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {isAdding && formBlock}
    </div>
  );
}
