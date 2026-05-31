'use client';
import { useEffect, useState } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { adminApi, type BankDetails } from '@/lib/api';

const EMPTY: BankDetails = {
  beneficiaryName: '',
  bankName: '',
  accountNumber: '',
  routingSwiftCode: '',
  address: '',
};

export default function SettingsPage() {
  const [form, setForm] = useState<BankDetails>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    adminApi.getBankDetails()
      .then(r => { if (r.success && r.data) setForm({ ...EMPTY, ...r.data }); })
      .finally(() => setLoading(false));
  }, []);

  const set = (field: keyof BankDetails) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const r = await adminApi.saveBankDetails(form);
      setMessage({ text: r.success ? 'Bank details saved successfully.' : (r.message ?? 'Save failed.'), ok: r.success });
    } catch {
      setMessage({ text: 'An error occurred. Please try again.', ok: false });
    } finally {
      setSaving(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', border: '1px solid #d1d5db',
    borderRadius: 6, fontSize: 14, boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 13, fontWeight: 600,
    color: '#374151', marginBottom: 6,
  };

  return (
    <AdminLayout>
      <div style={{ maxWidth: 640 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f2342', marginBottom: 4 }}>Settings</h1>
        <p style={{ color: '#64748b', fontSize: 14, marginBottom: 24 }}>
          Configure bank details used in the funding instructions email sent to investors when an application is sent to signers.
        </p>

        <div className="card">
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0f2342', marginBottom: 20 }}>Bank Details</h2>

          {loading ? (
            <p style={{ color: '#64748b', fontSize: 14 }}>Loading…</p>
          ) : (
            <form onSubmit={save}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={labelStyle}>Beneficiary Name</label>
                  <input style={inputStyle} value={form.beneficiaryName} onChange={set('beneficiaryName')} placeholder="e.g. DPEG Real Estate Fund, LP" />
                </div>
                <div>
                  <label style={labelStyle}>Bank Name</label>
                  <input style={inputStyle} value={form.bankName} onChange={set('bankName')} placeholder="e.g. Chase Bank" />
                </div>
                <div>
                  <label style={labelStyle}>Account Number</label>
                  <input style={inputStyle} value={form.accountNumber} onChange={set('accountNumber')} placeholder="Account number" />
                </div>
                <div>
                  <label style={labelStyle}>Routing Number / SWIFT Code</label>
                  <input style={inputStyle} value={form.routingSwiftCode} onChange={set('routingSwiftCode')} placeholder="Routing or SWIFT code" />
                </div>
                <div>
                  <label style={labelStyle}>Address</label>
                  <textarea
                    style={{ ...inputStyle, resize: 'vertical', minHeight: 72 }}
                    value={form.address}
                    onChange={set('address')}
                    placeholder="Office address shown in email footer"
                  />
                </div>
              </div>

              {message && (
                <div style={{
                  marginTop: 16, padding: '10px 14px', borderRadius: 6, fontSize: 13,
                  background: message.ok ? '#f0fdf4' : '#fef2f2',
                  color: message.ok ? '#15803d' : '#b91c1c',
                  border: `1px solid ${message.ok ? '#bbf7d0' : '#fecaca'}`,
                }}>
                  {message.text}
                </div>
              )}

              <div style={{ marginTop: 20 }}>
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    background: '#0f2342', color: '#fff', border: 'none',
                    borderRadius: 6, padding: '10px 24px', fontSize: 14,
                    fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
                    opacity: saving ? 0.7 : 1,
                  }}
                >
                  {saving ? 'Saving…' : 'Save Bank Details'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
