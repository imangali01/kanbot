export type AttachmentKind = 'photo' | 'video' | 'animation' | 'audio' | 'voice' | 'document';

export interface AttachmentInput {
  kind: AttachmentKind;
  fileId: string;
  uniqueId: string;
  name: string | null;
  mime: string | null;
  size: number | null;
}

interface FileLike { file_id: string; file_unique_id: string; file_name?: string; mime_type?: string; file_size?: number }
interface PhotoSize { file_id: string; file_unique_id: string; width: number; height: number; file_size?: number }

/** Часть сообщения Telegram, из которой берём вложения. */
export interface MessageWithMedia {
  photo?: PhotoSize[];
  document?: FileLike;
  video?: FileLike;
  animation?: FileLike;
  audio?: FileLike;
  voice?: FileLike;
  reply_to_message?: MessageWithMedia;
}

function ownAttachments(msg: MessageWithMedia): AttachmentInput[] {
  const out: AttachmentInput[] = [];
  if (msg.photo?.length) {
    // Telegram присылает одно фото в нескольких размерах — берём самое большое
    const best = msg.photo.reduce((a, b) => (b.width * b.height > a.width * a.height ? b : a));
    out.push({ kind: 'photo', fileId: best.file_id, uniqueId: best.file_unique_id, name: null, mime: 'image/jpeg', size: best.file_size ?? null });
  }
  const files: Array<[AttachmentKind, FileLike | undefined]> = [
    ['document', msg.document],
    ['video', msg.video],
    ['animation', msg.animation],
    ['audio', msg.audio],
    ['voice', msg.voice],
  ];
  for (const [kind, f] of files) {
    if (f) out.push({ kind, fileId: f.file_id, uniqueId: f.file_unique_id, name: f.file_name ?? null, mime: f.mime_type ?? null, size: f.file_size ?? null });
  }
  return out;
}

/** Вложения команды /task: из самого сообщения и из сообщения, на которое оно отвечает. Дубликаты отбрасываются. */
export function extractAttachments(msg: MessageWithMedia): AttachmentInput[] {
  const all = [...(msg.reply_to_message ? ownAttachments(msg.reply_to_message) : []), ...ownAttachments(msg)];
  const seen = new Set<string>();
  return all.filter((a) => (seen.has(a.uniqueId) ? false : (seen.add(a.uniqueId), true)));
}

/** Можно ли показать вложение как картинку-превью. */
export function isImage(a: { kind: AttachmentKind; mime: string | null }): boolean {
  return a.kind === 'photo' || (a.mime?.startsWith('image/') === true && a.mime !== 'image/svg+xml');
}
