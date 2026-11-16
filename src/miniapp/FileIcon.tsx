import { useId } from 'react';
import { fileTypeInfo } from '@/domain/fileType';
import s from './miniapp.module.css';

/** Значок файла по расширению: цветной листок с загнутым углом, подписью и бликом. */
export function FileIcon({ name, mime, kind, size = 40 }: { name: string | null; mime: string | null; kind: string; size?: number }) {
  const { label, tone } = fileTypeInfo({ name, mime, kind });
  const clip = useId();
  const fontSize = label.length > 4 ? 7 : label.length > 3 ? 8.5 : 10.5;
  return (
    <svg className={s.fileIcon} data-tone={tone} width={size} height={(size * 48) / 40} viewBox="0 0 40 48" aria-hidden="true">
      <defs>
        <clipPath id={clip}><path d="M6 1h19l14 14v28a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V5a4 4 0 0 1 4-4z" /></clipPath>
        <linearGradient id={`${clip}g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.28" />
          <stop offset="1" stopColor="#000" stopOpacity="0.14" />
        </linearGradient>
      </defs>
      <path className={s.fileBody} d="M6 1h19l14 14v28a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V5a4 4 0 0 1 4-4z" />
      <path d="M6 1h19l14 14v28a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V5a4 4 0 0 1 4-4z" fill={`url(#${clip}g)`} />
      <path className={s.fileFold} d="M25 1v10a4 4 0 0 0 4 4h10z" />
      <g clipPath={`url(#${clip})`}><rect className={s.fileShine} x="-14" y="-4" width="10" height="60" /></g>
      <text className={s.fileLabel} x="20" y="37.5" textAnchor="middle" fontSize={fontSize}>{label}</text>
    </svg>
  );
}
