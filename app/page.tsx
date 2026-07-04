'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminAuth } from '@/contexts/AdminAuthContext';

export default function Root() {
  const { user, loading } = useAdminAuth();
  const router = useRouter();
  useEffect(() => {
    if (!loading) router.replace(user ? '/executive-copilot' : '/login');
  }, [user, loading, router]);
  return null;
}
