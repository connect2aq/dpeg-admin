'use client';
import { useState } from 'react';
import AdminLayout from '@/components/AdminLayout';

interface SmtpConfig {
  smtpServer: string;
  port: number;
  username: string;
  password: string;
  senderName: string;
  senderEmail: string;
  replyToEmail: string;
  enableSsl: boolean;
  recipient: string;
  subject: string;
  body: string;
}

interface Result { success: boolean | null; message: string; detail?: string }

const GMAIL_DEFAULTS: SmtpConfig = {
  smtpServer: 'smtp.gmail.com', port: 587, enableSsl: true,
  username: 'altitude.ix00@gmail.com', password: '',
  senderEmail: 'altitude.ix00@gmail.com', senderName: 'DPEG Fund',
  replyToEmail: 'techsupport@dhananipeg.com',
  recipient: '', subject: 'Gmail SMTP Test — DPEG Funds',
  body: 'This is a test email sent via Gmail SMTP to verify the configuration is working correctly.',
};

const M365_DEFAULTS: SmtpConfig = {
  smtpServer: 'smtp.office365.com', port: 587, enableSsl: true,
  username: 'investorportal@dhananipeg.com', password: '',
  senderEmail: 'investorportal@dhananipeg.com', senderName: 'Investor Portal',
  replyToEmail: 'techsupport@dhananipeg.com',
  recipient: '', subject: 'M365 SMTP Test — DPEG Investor Portal',
  body: 'This is a test email sent via Microsoft 365 SMTP to verify the configuration is working correctly.',
};

function SmtpPanel({ title, color, defaults }: { title: string; color: string; defaults: SmtpConfig }) {
  const [cfg, setCfg] = useState<SmtpConfig>(defaults);
  const [showPw, setShowPw] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const set = (k: keyof SmtpConfig, v: string | boolean | number) =>
    setCfg(prev => ({ ...prev, [k]: v }));

  const send = async () => {
    if (!cfg.recipient) { setResult({ success: false, message: 'Recipient email is required.' }); return; }
    setSending(true);
    setResult({ success: null, message: 'Sending, please wait…' });
    try {
      const token = localStorage.getItem('adminToken');
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL?.replace('/admin', '') ?? ''}smtptest/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...cfg, recipientEmail: cfg.recipient }),
      });
      const data = await res.json();
      setResult({ success: data.success, message: data.message, detail: data.detail });
    } catch (err: unknown) {
      setResult({ success: false, message: 'Network error — could not reach the API.', detail: String(err) });
    } finally {
      setSending(false);
    }
  };

  const field = (label: string, key: keyof SmtpConfig, type = 'text') => (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94a3b8', marginBottom: 4 }}>{label}</div>
      <input
        type={type}
        value={String(cfg[key])}
        onChange={e => set(key, type === 'number' ? Number(e.target.value) : e.target.value)}
        style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #e2e8f0', borderRadius: 6, fontSize: 13, background: '#f8fafc', fontFamily: 'monospace' }}
      />
    </div>
  );

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ background: color, color: 'white', padding: '14px 20px', fontWeight: 700, fontSize: 15 }}>{title}</div>
      <div style={{ padding: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          {field('SMTP Host', 'smtpServer')}
          {field('Port', 'port', 'number')}
          {field('Username', 'username')}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94a3b8', marginBottom: 4 }}>Password</div>
            <div style={{ position: 'relative' }}>
              <input
                type={showPw ? 'text' : 'password'}
                value={cfg.password}
                onChange={e => set('password', e.target.value)}
                style={{ width: '100%', padding: '8px 32px 8px 10px', border: '1.5px solid #e2e8f0', borderRadius: 6, fontSize: 13, background: '#f8fafc', fontFamily: 'monospace' }}
              />
              <button onClick={() => setShowPw(p => !p)} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 13 }}>
                {showPw ? '🙈' : '👁'}
              </button>
            </div>
          </div>
          {field('Sender Email', 'senderEmail')}
          {field('Sender Name', 'senderName')}
          <div style={{ gridColumn: 'span 2' }}>{field('Reply-To', 'replyToEmail')}</div>
          <div style={{ gridColumn: 'span 2' }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94a3b8', marginBottom: 4 }}>Enable SSL</div>
            <select value={String(cfg.enableSsl)} onChange={e => set('enableSsl', e.target.value === 'true')}
              style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #e2e8f0', borderRadius: 6, fontSize: 13, background: '#f8fafc' }}>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          </div>
        </div>

        <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {field('Test Recipient Email', 'recipient', 'email')}
          {field('Subject', 'subject')}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94a3b8', marginBottom: 4 }}>Body</div>
            <textarea value={cfg.body} onChange={e => set('body', e.target.value)} rows={3}
              style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #e2e8f0', borderRadius: 6, fontSize: 13, resize: 'vertical', fontFamily: 'inherit' }} />
          </div>
        </div>

        <button onClick={send} disabled={sending} className="btn-primary" style={{ width: '100%', marginTop: 12 }}>
          {sending ? 'Sending…' : `Send Test via ${title.split(' ')[0]}`}
        </button>

        {result && (
          <div style={{
            marginTop: 12, padding: '10px 14px', borderRadius: 8, fontSize: 13,
            background: result.success === null ? '#eff6ff' : result.success ? '#f0fdf4' : '#fef2f2',
            border: `1px solid ${result.success === null ? '#bfdbfe' : result.success ? '#bbf7d0' : '#fecaca'}`,
            color: result.success === null ? '#1e40af' : result.success ? '#166534' : '#991b1b',
          }}>
            <div style={{ fontWeight: 600 }}>{result.success === null ? '⏳' : result.success ? '✓ Success' : '✗ Failed'}</div>
            <div>{result.message}</div>
            {result.detail && <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>{result.detail}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

export default function SmtpTestPage() {
  return (
    <AdminLayout>
      <div style={{ padding: '32px 36px' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0e3416', marginBottom: 6 }}>SMTP Test</h1>
        <p style={{ fontSize: 13, color: '#64748b', marginBottom: 28 }}>Send test emails to verify SMTP configuration on the server.</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <SmtpPanel title="Gmail SMTP" color="#ea4335" defaults={GMAIL_DEFAULTS} />
          <SmtpPanel title="Microsoft 365 SMTP" color="#0078d4" defaults={M365_DEFAULTS} />
        </div>
      </div>
    </AdminLayout>
  );
}
