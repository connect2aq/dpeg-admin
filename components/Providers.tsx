'use client';
import { AdminAuthProvider } from '@/contexts/AdminAuthContext';

export default function Providers({ children }: { children: React.ReactNode }) {
  return <AdminAuthProvider>{children}</AdminAuthProvider>;
}
