'use client';
import { useEffect, useState } from 'react';
import AdminLayout from '@/components/AdminLayout';
import { adminApi, type BankDetails, type NotificationEmail } from '@/lib/api';

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

  const [notifEmails, setNotifEmails] = useState<NotificationEmail[]>([]);
  const [notifLoading, setNotifLoading] = useState(true);
  const [newEmail, setNewEmail] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [addingEmail, setAddingEmail] = useState(false);
  const [emailMsg, setEmailMsg] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    adminApi.getBankDetails()
      .then(r => { if (r.success && r.data) setForm({ ...EMPTY, ...r.data }); })
      .finally(() => setLoading(false));
    adminApi.getNotificationEmails()
      .then(r => { if (r.success && r.data) setNotifEmails(r.data); })
      .finally(() => setNotifLoading(false));
  }, []);

  const addEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim()) return;
    setAddingEmail(true); setEmailMsg(null);
    const r = await adminApi.addNotificationEmail(newEmail.trim(), newLabel.trim() || undefined);
    if (r.success && r.data) {
      setNotifEmails(prev => [...prev, r.data!]);
      setNewEmail(''); setNewLabel('');
    }
    setEmailMsg({ text: r.success ? 'Email added.' : (r.message ?? 'Failed'), ok: r.success });
    setAddingEmail(false);
    setTimeout(() => setEmailMsg(null), 4000);
  };

  const removeEmail = async (id: number) => {
    const r = await adminApi.deleteNotificationEmail(id);
    if (r.success) setNotifEmails(prev => prev.filter(e => e.id !== id));
  };

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
        {/* Notification Emails */}
        <div className="card" style={{ marginTop: 28 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#0f2342', marginBottom: 6 }}>Admin Notification Emails</h2>
          <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>
            System alerts (Odoo failures, mismatch alerts, job errors) are sent to these addresses.
            If none are configured, alerts fall back to the default admin email.
          </p>

          {notifLoading ? (
            <p style={{ fontSize: 13, color: '#64748b' }}>Loading…</p>
          ) : (
            <>
              {notifEmails.length > 0 && (
                <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {notifEmails.map(e => (
                    <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                      <span style={{ flex: 1, fontSize: 14, color: '#1a1a2e', fontWeight: 500 }}>{e.emailAddress}</span>
                      {e.label && <span style={{ fontSize: 12, color: '#94a3b8' }}>{e.label}</span>}
                      <button onClick={() => removeEmail(e.id)}
                        style={{ padding: '3px 10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 5, fontSize: 12, color: '#b91c1c', cursor: 'pointer' }}>
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <form onSubmit={addEmail} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <input
                  type="email"
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  placeholder="admin@example.com"
                  required
                  style={{ ...inputStyle, flex: '1 1 200px', maxWidth: 260 }}
                />
                <input
                  value={newLabel}
                  onChange={e => setNewLabel(e.target.value)}
                  placeholder="Label (optional)"
                  style={{ ...inputStyle, flex: '1 1 150px', maxWidth: 200 }}
                />
                <button type="submit" disabled={addingEmail}
                  style={{ padding: '9px 18px', background: '#0f2342', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: addingEmail ? 'not-allowed' : 'pointer', opacity: addingEmail ? 0.7 : 1 }}>
                  {addingEmail ? 'Adding…' : 'Add Email'}
                </button>
              </form>

              {emailMsg && (
                <div style={{ marginTop: 10, fontSize: 13, color: emailMsg.ok ? '#15803d' : '#b91c1c' }}>{emailMsg.text}</div>
              )}
            </>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
