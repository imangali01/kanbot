export type FileTone = 'green' | 'blue' | 'red' | 'orange' | 'gray' | 'yellow' | 'purple' | 'teal' | 'pink';
export interface FileTypeInfo { label: string; tone: FileTone }

const t = (label: string, tone: FileTone): FileTypeInfo => ({ label, tone });

const BY_EXT: Record<string, FileTypeInfo> = {
  xls: t('XLS', 'green'), xlsx: t('XLS', 'green'), xlsm: t('XLS', 'green'), ods: t('XLS', 'green'), csv: t('CSV', 'green'), tsv: t('TSV', 'green'),
  doc: t('DOC', 'blue'), docx: t('DOC', 'blue'), odt: t('DOC', 'blue'), rtf: t('RTF', 'blue'),
  pdf: t('PDF', 'red'),
  ppt: t('PPT', 'orange'), pptx: t('PPT', 'orange'), odp: t('PPT', 'orange'),
  html: t('HTML', 'orange'), htm: t('HTML', 'orange'), xml: t('XML', 'orange'), ipynb: t('IPYNB', 'orange'),
  css: t('CSS', 'blue'), ts: t('TS', 'blue'), tsx: t('TSX', 'blue'), py: t('PY', 'blue'),
  js: t('JS', 'yellow'), mjs: t('JS', 'yellow'), jsx: t('JSX', 'yellow'), json: t('JSON', 'yellow'),
  yml: t('YML', 'purple'), yaml: t('YML', 'purple'), sql: t('SQL', 'purple'),
  sh: t('SH', 'gray'), txt: t('TXT', 'gray'), log: t('LOG', 'gray'), md: t('MD', 'gray'),
  zip: t('ZIP', 'yellow'), rar: t('RAR', 'yellow'), '7z': t('7Z', 'yellow'), gz: t('GZ', 'yellow'), tar: t('TAR', 'yellow'),
  png: t('PNG', 'teal'), jpg: t('JPG', 'teal'), jpeg: t('JPG', 'teal'), gif: t('GIF', 'teal'), webp: t('WEBP', 'teal'), svg: t('SVG', 'teal'),
  mp4: t('MP4', 'pink'), mov: t('MOV', 'pink'), avi: t('AVI', 'pink'), mkv: t('MKV', 'pink'),
  mp3: t('MP3', 'purple'), wav: t('WAV', 'purple'), ogg: t('OGG', 'purple'), oga: t('OGG', 'purple'), m4a: t('M4A', 'purple'),
};

const BY_MIME_PREFIX: Array<[string, FileTypeInfo]> = [
  ['video/', t('VIDEO', 'pink')],
  ['audio/', t('AUDIO', 'purple')],
  ['image/', t('IMG', 'teal')],
  ['text/', t('TXT', 'gray')],
];

export function extOf(name: string | null): string {
  const m = name?.toLowerCase().match(/\.([a-z0-9]{1,6})$/);
  return m ? m[1] : '';
}

/** Подпись и цвет значка файла по расширению, а если его нет — по виду вложения и MIME. */
export function fileTypeInfo(a: { name: string | null; mime: string | null; kind: string }): FileTypeInfo {
  const ext = extOf(a.name);
  if (BY_EXT[ext]) return BY_EXT[ext];
  if (a.kind === 'voice') return t('VOICE', 'purple');
  if (a.kind === 'audio') return t('AUDIO', 'purple');
  if (a.kind === 'video') return t('VIDEO', 'pink');
  if (a.kind === 'animation') return t('GIF', 'pink');
  if (a.mime) for (const [prefix, info] of BY_MIME_PREFIX) if (a.mime.startsWith(prefix)) return info;
  return t(ext ? ext.toUpperCase() : 'FILE', 'gray');
}
