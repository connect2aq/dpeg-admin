'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import AdminLayout from '@/components/AdminLayout';
import { historicalImportApi, type ImportSessionListItem } from '@/lib/api';

export default function ImportHistoryPage() {
  const [sessions, setSessions]   = useState<ImportSessionListItem[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');

  useEffect(() => {
    historicalImportApi.getSessions()
      .then(res => {
        if (res.success) setSessions(res.data);
        else setError(res.message || 'Failed to load import history.');
      })
      .catch(() => setError('Network error. Please try again.'))
      .finally(() => setLoading(false));
  }, []);

  const s = {
    page:  { padding: '32px 0' } as React.CSSProperties,
    h1:    { fontSize: 22, fontWeight: 700, color: '#0f2342', marginBottom: 4 } as React.CSSProperties,
    sub:   { color: '#64748b', fontSize: 14, marginBottom: 28 } as React.CSSProperties,
    card:  { background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '20px 24px' } as React.CSSProperties,
    table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 13 },
    th:    { padding: '8px 12px', textAlign: 'left' as const, background: '#0f2342', color: '#fff', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' as const },
    td:    { padding: '10px 12px', borderBottom: '1px solid #f1f5f9', color: '#1a1a2e' },
  };

  return (
    <AdminLayout>
      <div style={s.page}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <h1 style={{ ...s.h1, marginBottom: 0 }}>Import History</h1>
          <Link href="/historical-import" style={{ fontSize: 13, color: '#b8923a', fontWeight: 600, textDecoration: 'none' }}>
            ← New Import
          </Link>
        </div>
        <p style={s.sub}>All historical import sessions, most recent first. Click a session to take action on its rows.</p>

        <div style={s.card}>
          {loading && <p style={{ color: '#64748b', fontSize: 13 }}>Loading…</p>}
          {error   && <p style={{ color: '#991b1b', fontSize: 13 }}>{error}</p>}
          {!loading && !error && sessions.length === 0 && (
            <p style={{ color: '#64748b', fontSize: 13 }}>No imports yet.</p>
          )}
          {!loading && sessions.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>#</th>
                    <th style={s.th}>File</th>
                    <th style={s.th}>Imported At</th>
                    <th style={s.th}>Total</th>
                    <th style={s.th}>Succeeded</th>
                    <th style={s.th}>Failed</th>
                    <th style={s.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map(s2 => (
                    <tr key={s2.id}>
                      <td style={s.td}>{s2.id}</td>
                      <td style={s.td}>{s2.fileName}</td>
                      <td style={s.td}>{new Date(s2.importedAt).toLocaleString()}</td>
                      <td style={s.td}>{s2.totalRows}</td>
                      <td style={{ ...s.td, color: '#166534', fontWeight: 600 }}>{s2.succeeded}</td>
                      <td style={{ ...s.td, color: s2.failed > 0 ? '#991b1b' : '#64748b', fontWeight: 600 }}>{s2.failed}</td>
                      <td style={s.td}>
                        <Link
                          href={`/historical-import/history/${s2.id}`}
                          style={{ color: '#b8923a', fontWeight: 600, fontSize: 12, textDecoration: 'none' }}
                        >
                          View & Act →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
