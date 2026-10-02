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
    else setError(r.error ?? 'Не удалось отправить код. Попробуйте ещё раз.');
  }

  async function verifyCode() {
    setBusy(true);
    setError(null);
    const r = await post('/api/admin/login/verify', { username, code });
    setBusy(false);
    if (r.ok) router.replace('/admin');
    else setError(r.error ?? 'Не удалось войти. Попробуйте ещё раз.');
  }

  return (
    <main className={s.page}>
      <div className={s.loginWrap}>
        <div className={s.brand}>
          <span className={s.brandMark}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 5v14M12 5v9M19 5v5" /></svg>
          </span>
          kanbot
        </div>
        <h1 className={s.loginTitle}>{step === 'username' ? 'Вход в админку' : 'Введите код'}</h1>
        <p className={s.lead}>
          {step === 'username'
            ? 'Укажите свой Telegram-username. Бот пришлёт код в личные сообщения.'
            : 'Если такой админ есть, бот отправил код в Telegram. Он действует 5 минут.'}
        </p>
        <div className={s.form}>
          {step === 'username' ? (
            <>
              <input className={s.input} placeholder="@username" autoComplete="username" autoCapitalize="none" value={username} onChange={(e) => setUsername(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && username.trim() && !busy && void requestCode()} />
              <button className={s.btnPrimary} disabled={!username.trim() || busy} onClick={() => void requestCode()}>{busy ? 'Отправляем…' : 'Получить код'}</button>
              <p className={s.hint}>Код придёт, только если вы уже нажимали /start у бота.</p>
            </>
          ) : (
            <>
              <input className={s.codeInput} inputMode="numeric" autoComplete="one-time-code" maxLength={4} placeholder="••••" autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => e.key === 'Enter' && code.length === 4 && !busy && void verifyCode()} />
              <button className={s.btnPrimary} disabled={code.length !== 4 || busy} onClick={() => void verifyCode()}>{busy ? 'Проверяем…' : 'Войти'}</button>
              <button className={s.btn} onClick={() => { setStep('username'); setCode(''); setError(null); }}>Другой username</button>
            </>
          )}
          {error && <p className={s.error} role="alert">{error}</p>}
        </div>
      </div>
    </main>
  );
}
