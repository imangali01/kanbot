'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import s from '../admin.module.css';

async function post(path: string, body: unknown): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  return { ok: res.ok, error: data.error };
}

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'username' | 'code'>('username');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function requestCode() {
    setBusy(true);
    setError(null);
    const r = await post('/api/admin/login/request', { username });
    setBusy(false);
    if (r.ok) setStep('code');
    else setError(r.error ?? 'Ошибка');
  }

  async function verifyCode() {
    setBusy(true);
    setError(null);
    const r = await post('/api/admin/login/verify', { username, code });
    setBusy(false);
    if (r.ok) router.replace('/admin');
    else setError(r.error ?? 'Ошибка');
  }

  return (
    <main className={s.page}>
      <h1 className={s.title}>Вход в kanbot</h1>
      <div className={s.form}>
        <input className={s.input} placeholder="@username в Telegram" value={username} disabled={step === 'code'} onChange={(e) => setUsername(e.target.value)} />
        {step === 'username' ? (
          <>
            <button className={s.btnPrimary} disabled={!username.trim() || busy} onClick={() => void requestCode()}>Получить код</button>
            <p className={s.hint}>Код придёт в личку от бота. Если вы ещё не писали боту — сначала отправьте ему /start.</p>
          </>
        ) : (
          <>
            <p className={s.hint}>Если такой админ есть, код отправлен в Telegram.</p>
            <input className={s.input} inputMode="numeric" maxLength={4} placeholder="Код из 4 цифр" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
            <button className={s.btnPrimary} disabled={code.length !== 4 || busy} onClick={() => void verifyCode()}>Войти</button>
            <button className={s.btn} onClick={() => { setStep('username'); setCode(''); }}>Другой username</button>
          </>
        )}
        {error && <p className={s.error}>{error}</p>}
      </div>
    </main>
  );
}
