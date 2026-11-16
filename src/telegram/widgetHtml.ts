import { formatDateRu } from '../domain/dates';
import { ticketId } from '../domain/ticketId';
import { STATUS_TITLES, type Status } from '../domain/types';
import { avatarHue } from '../miniapp/avatarUtils';

export type WidgetKind = 'created' | 'moved' | 'done' | 'blocked' | 'unblocked';

export interface WidgetCard {
  board: string;
  number: number;
  kind: WidgetKind;
  text: string;
  deadline?: string;
  from?: Status;
  to?: Status;
  /** Кто поставил задачу / кто совершил действие. */
  who: string;
  whoLabel: 'Поставил' | 'Кто';
  reason?: string | null;
}

export interface WidgetMessage { html: string; height: number; caption: string }

// Цвета события: акцент слева, плашка (фон + текст) и подпись для старых клиентов.
const KIND: Record<WidgetKind, { title: string; accent: string; pillBg: string; pillFg: string }> = {
  created: { title: 'Новая задача', accent: '#46c07f', pillBg: '#1f3d2e', pillFg: '#7fe0ac' },
  moved: { title: 'Перенос', accent: '#f2b84b', pillBg: '#40331a', pillFg: '#f7cf7e' },
  done: { title: 'Выполнена', accent: '#46c07f', pillBg: '#1f3d2e', pillFg: '#7fe0ac' },
  blocked: { title: 'Заблокирована', accent: '#e5605f', pillBg: '#442123', pillFg: '#ff9d9c' },
  unblocked: { title: 'Разблокирована', accent: '#6aa9ff', pillBg: '#1d3552', pillFg: '#9cc6ff' },
};
const STATUS_COLOR: Record<Status, string> = { todo: '#9aa0ab', in_progress: '#f2b84b', done: '#46c07f' };

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const cut = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, max - 1)}…`);

// Только базовый CSS и блочная вёрстка: виджет работает не в браузере, а в упрощённом движке Telegram.
const STYLE =
  'body{margin:0;padding:0}' +
  '.c{box-sizing:border-box;margin:0;padding:12px 14px 12px 16px;background:#17191f;color:#f2f3f5;border-left:4px solid;border-radius:14px;font:15px/1.35 -apple-system,system-ui,sans-serif;overflow:hidden}' +
  '.h{display:flex;align-items:center}' +
  '.a{flex:none;width:34px;height:34px;margin-right:10px;border-radius:10px;color:#fff;font-weight:700;text-align:center;line-height:34px}' +
  '.b{flex:1;min-width:0}.n{font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.i{font-size:12px;color:#9aa0ab}' +
  '.p{flex:none;margin-left:8px;padding:3px 10px;border-radius:99px;font-size:12px;font-weight:650;white-space:nowrap}' +
  '.t{margin:10px 0 8px;font-size:16px;font-weight:600;word-break:break-word}' +
  '.k{display:inline-block;margin:0 16px 4px 0;vertical-align:top}.k span{display:block;font-size:11.5px;color:#9aa0ab}.k b{font-weight:600}' +
  '.d{display:inline-block;width:8px;height:8px;margin-right:4px;border-radius:50%}' +
  '.r{margin:4px 0 6px;padding:6px 10px;border-radius:8px;background:#3a2023;color:#ffb4b3;font-size:13.5px;word-break:break-word}';

const fact = (label: string, valueHtml: string) => `<div class="k"><span>${label}</span><b>${valueHtml}</b></div>`;
const statusHtml = (st: Status) => `<i class="d" style="background:${STATUS_COLOR[st]}"></i>${STATUS_TITLES[st]}`;

/** HTML-виджет для личного уведомления (Bot API sendWidget): карточка доски и задачи. Лимит Telegram — 4096 байт после сжатия. */
export function buildWidget(c: WidgetCard): WidgetMessage {
  const k = KIND[c.kind];
  const board = c.board || 'Без названия';
  const text = cut(c.text, 140);
  const facts: string[] = [];
  if (c.from && c.to) facts.push(fact('Статус', `${statusHtml(c.from)} → ${statusHtml(c.to)}`));
  if (c.deadline) facts.push(fact('Срок', formatDateRu(c.deadline)));
  facts.push(fact(c.whoLabel, esc(cut(c.who, 40))));

  const reason = c.reason ? `<div class="r">${c.kind === 'blocked' ? 'Причина' : 'Блок был из-за'}: ${esc(cut(c.reason, 120))}</div>` : '';
  const html =
    `<style>${STYLE}</style>` +
    `<div class="c" style="border-left-color:${k.accent}">` +
    `<div class="h"><div class="a" style="background:hsl(${avatarHue(board)},42%,46%)">${esc(Array.from(board)[0].toUpperCase())}</div>` +
    `<div class="b"><div class="n">${esc(cut(board, 50))}</div><div class="i">${ticketId(c.number)}</div></div>` +
    `<div class="p" style="background:${k.pillBg};color:${k.pillFg}">${k.title}</div></div>` +
    `<div class="t">${esc(text)}</div>${reason}${facts.join('')}</div>`;

  // высоту задаём явно: содержимое выше обрезается, а лишнее место — пустой фон
  const lines = Math.min(4, Math.max(1, Math.ceil(text.length / 32)));
  const height = 28 + 36 + 12 + lines * 22 + 14 + 40 + (c.reason ? 42 : 0) + (c.from ? 8 : 0);
  return { html, height, caption: `${k.title} · ${ticketId(c.number)} · ${cut(board, 60)}` };
}
