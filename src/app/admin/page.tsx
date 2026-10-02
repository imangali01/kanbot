'use client';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { AdminChats, type AdminCall } from '@/admin/AdminChats';

export default function AdminPage() {
  const router = useRouter();

  const call: AdminCall = useCallback(async (path, init) => {
    const res = await fetch(path, {
      method: init?.method ?? 'GET',
      headers: { 'content-type': 'application/json' },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    });
    return { status: res.status, data: await res.json().catch(() => ({})) };
  }, []);

  const onUnauthorized = useCallback(() => router.replace('/admin/login'), [router]);

  const onLogout = useCallback(async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    router.replace('/admin/login');
  }, [router]);

  return <AdminChats call={call} onUnauthorized={onUnauthorized} onLogout={onLogout} />;
}
