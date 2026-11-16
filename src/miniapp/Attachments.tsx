'use client';
import { useEffect, useState } from 'react';
import { isImage } from '@/domain/attachments';
import type { AttachmentView } from '@/domain/types';
import { webApp } from './telegram';
import { IconClose } from './icons';
import s from './miniapp.module.css';

const KIND_NAMES: Record<AttachmentView['kind'], string> = {
  photo: 'Фото',
  video: 'Видео',
  animation: 'GIF',
  audio: 'Аудио',
  voice: 'Голосовое',
  document: 'Файл',
};

function fileLabel(a: AttachmentView): string {
  return a.name ?? `${KIND_NAMES[a.kind]} ${a.id}`;
}

function fmtSize(bytes: number | null): string {
  if (bytes === null) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} МБ`;
}

async function loadBlob(taskId: number, a: AttachmentView): Promise<Blob> {
  const res = await fetch(`/api/app/tasks/${taskId}/attachments/${a.id}`, { headers: { Authorization: `tma ${webApp()?.initData ?? ''}` } });
  if (!res.ok) {
    const data: unknown = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? 'Не удалось загрузить файл');
  }
  return res.blob();
}

function Thumb({ taskId, a, onOpen }: { taskId: number; a: AttachmentView; onOpen: (url: string) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let revoked = false;
    let objectUrl: string | null = null;
    loadBlob(taskId, a)
      .then((b) => {
        if (revoked) return;
        objectUrl = URL.createObjectURL(b);
        setUrl(objectUrl);
      })
      .catch(() => !revoked && setFailed(true));
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [taskId, a]);

  if (failed) return <div className={s.thumbEmpty}>Не загрузилось</div>;
  if (!url) return <div className={s.thumbEmpty} aria-busy="true" />;
  return (
    <button className={s.thumb} aria-label={`Открыть: ${fileLabel(a)}`} onClick={() => onOpen(url)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={fileLabel(a)} />
    </button>
  );
}

export function Attachments({ taskId, items }: { taskId: number; items: AttachmentView[] }) {
  const [viewer, setViewer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  if (items.length === 0) return null;
  const images = items.filter(isImage);
  const files = items.filter((a) => !isImage(a));

  async function download(a: AttachmentView) {
    setBusyId(a.id);
    setError(null);
    try {
      const url = URL.createObjectURL(await loadBlob(taskId, a));
      const link = document.createElement('a');
      link.href = url;
      link.download = fileLabel(a);
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось загрузить файл');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <h3 className={s.sectionTitle}>Вложения</h3>
      {images.length > 0 && (
        <div className={s.thumbs}>
          {images.map((a) => <Thumb key={a.id} taskId={taskId} a={a} onOpen={setViewer} />)}
        </div>
      )}
      {files.length > 0 && (
        <div className={s.files}>
          {files.map((a) => (
            <button key={a.id} className={s.fileRow} disabled={busyId === a.id} onClick={() => void download(a)}>
              <span className={s.fileName}>{fileLabel(a)}</span>
              <span className={s.muted}>{busyId === a.id ? 'Загрузка…' : fmtSize(a.size)}</span>
            </button>
          ))}
        </div>
      )}
      {error && <p className={s.errorLine} role="alert">{error}</p>}
      {viewer && (
        <div className={s.viewer} role="dialog" aria-label="Просмотр изображения" onClick={() => setViewer(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={viewer} alt="" />
          <button className={s.viewerClose} aria-label="Закрыть"><IconClose size={22} /></button>
        </div>
      )}
    </>
  );
}
