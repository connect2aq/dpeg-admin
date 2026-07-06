'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminAuth } from '@/contexts/AdminAuthContext';
import { isExecutiveCopilotAllowed } from '@/lib/executiveCopilot/accessControl';

export default function Root() {
  const { user, loading } = useAdminAuth();
  const router = useRouter();
  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace('/login'); return; }
    router.replace(isExecutiveCopilotAllowed(user.email) ? '/executive-copilot' : '/dashboard');
  }, [user, loading, router]);
  return null;
}
