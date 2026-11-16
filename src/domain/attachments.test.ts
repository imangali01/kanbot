import { describe, expect, it } from 'vitest';
import { extractAttachments, isImage } from './attachments';

const size = (id: string, w: number, h: number) => ({ file_id: id, file_unique_id: `u-${id}`, width: w, height: h });

describe('extractAttachments', () => {
  it('returns nothing for a plain text message', () => {
    expect(extractAttachments({})).toEqual([]);
  });

  it('takes the largest size of a photo', () => {
    const r = extractAttachments({ photo: [size('s', 90, 90), size('l', 1280, 960), size('m', 320, 240)] });
    expect(r).toEqual([{ kind: 'photo', fileId: 'l', uniqueId: 'u-l', name: null, mime: 'image/jpeg', size: null }]);
  });

  it('takes a document with its name, mime and size', () => {
    const r = extractAttachments({ document: { file_id: 'd', file_unique_id: 'ud', file_name: 'отчёт.xlsx', mime_type: 'application/vnd.ms-excel', file_size: 1234 } });
    expect(r).toEqual([{ kind: 'document', fileId: 'd', uniqueId: 'ud', name: 'отчёт.xlsx', mime: 'application/vnd.ms-excel', size: 1234 }]);
  });

  it('collects attachments of the replied-to message first, then own', () => {
    const r = extractAttachments({
      document: { file_id: 'own', file_unique_id: 'u-own' },
      reply_to_message: { photo: [size('p', 100, 100)] },
    });
    expect(r.map((a) => a.fileId)).toEqual(['p', 'own']);
  });

  it('drops duplicates by file_unique_id', () => {
    const doc = { file_id: 'a', file_unique_id: 'same' };
    expect(extractAttachments({ document: doc, reply_to_message: { document: { ...doc, file_id: 'b' } } })).toHaveLength(1);
  });
});

describe('isImage', () => {
  it('photos and image documents are previewable, svg is not', () => {
    expect(isImage({ kind: 'photo', mime: null })).toBe(true);
    expect(isImage({ kind: 'document', mime: 'image/png' })).toBe(true);
    expect(isImage({ kind: 'document', mime: 'image/svg+xml' })).toBe(false);
    expect(isImage({ kind: 'document', mime: 'application/pdf' })).toBe(false);
  });
});
