'use client';
import { useEffect, useState, type CSSProperties } from 'react';
import { isImage } from '@/domain/attachments';
import { fileTypeInfo } from '@/domain/fileType';
import type { AttachmentView } from '@/domain/types';
import { api, errorText } from './api';
import { FileIcon } from './FileIcon';
import { IconClose, IconDownload } from './icons';
import { webApp } from './telegram';
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
  return a.name ?? `${KIND_NAMES[a.kind]} ${a.id}${a.kind === 'photo' ? '.jpg' : ''}`;
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

/** Скачивание: Telegram сам кладёт файл в «Загрузки» и предлагает «Открыть / Показать в папке». */
async function startDownload(taskId: number, a: AttachmentView): Promise<void> {
  const { url } = await api<{ url: string }>(`/api/app/tasks/${taskId}/attachments/${a.id}/link`);
  const wa = webApp();
  if (wa?.downloadFile && wa.isVersionAtLeast?.('8.0')) {
    wa.downloadFile({ url, file_name: fileLabel(a) });
    wa.HapticFeedback?.impactOccurred('light');
  } else if (wa?.openLink) {
    wa.openLink(url);
  } else {
    window.open(url, '_blank');
  }
}

function Thumb({ taskId, a, onOpen }: { taskId: number; a: AttachmentView; onOpen: (a: AttachmentView, url: string) => void }) {
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
    <button className={s.thumb} aria-label={`Открыть: ${fileLabel(a)}`} onClick={() => onOpen(a, url)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={fileLabel(a)} />
    </button>
  );
}

export function Attachments({ taskId, items }: { taskId: number; items: AttachmentView[] }) {
  const [viewer, setViewer] = useState<{ a: AttachmentView; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  if (items.length === 0) return null;
  const images = items.filter(isImage);
  const files = items.filter((a) => !isImage(a));

  async function download(a: AttachmentView) {
    setBusyId(a.id);
    setError(null);
    try {
      await startDownload(taskId, a);
    } catch (e) {
      setError(errorText(e));
    } finally {
      // стрелка «подпрыгивает» чуть дольше запроса, чтобы нажатие было заметно
      setTimeout(() => setBusyId((id) => (id === a.id ? null : id)), 700);
    }
  }

  return (
    <>
      <h3 className={s.sectionTitle}>Вложения</h3>
      {images.length > 0 && (
        <div className={s.thumbs}>
          {images.map((a) => <Thumb key={a.id} taskId={taskId} a={a} onOpen={(att, url) => setViewer({ a: att, url })} />)}
        </div>
      )}
      {files.length > 0 && (
        <div className={s.files}>
          {files.map((a, i) => {
            const { label, tone } = fileTypeInfo(a);
            return (
              <button
                key={a.id}
                className={s.fileRow}
                data-tone={tone}
                data-busy={busyId === a.id}
                style={{ '--i': i } as CSSProperties}
                aria-label={`Скачать: ${fileLabel(a)}`}
                onClick={() => void download(a)}
              >
                <FileIcon name={a.name} mime={a.mime} kind={a.kind} size={36} />
                <span className={s.fileInfo}>
                  <span className={s.fileName}>{fileLabel(a)}</span>
                  <span className={s.fileMeta}>{[label, fmtSize(a.size)].filter(Boolean).join(' · ')}</span>
                </span>
                <span className={s.fileDl}><IconDownload size={18} /></span>
              </button>
            );
          })}
        </div>
      )}
      {error && <p className={s.errorLine} role="alert">{error}</p>}
      {viewer && (
        <div className={s.viewer} role="dialog" aria-label="Просмотр изображения" onClick={() => setViewer(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={viewer.url} alt={fileLabel(viewer.a)} />
          <div className={s.viewerBtns} onClick={(e) => e.stopPropagation()}>
            <button className={s.viewerBtn} aria-label="Скачать" onClick={() => void download(viewer.a)}><IconDownload size={22} /></button>
            <button className={s.viewerBtn} aria-label="Закрыть" onClick={() => setViewer(null)}><IconClose size={22} /></button>
          </div>
        </div>
      )}
    </>
  );
}
