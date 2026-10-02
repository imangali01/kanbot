# kanbot

Telegram-бот (`@t8981_bot`) + Mini App канбан (Todo / In progress / Done) + веб-админка.
Дизайн: `docs/superpowers/specs/2026-10-02-kanbot-design.md`. План: `docs/superpowers/plans/`.

## Стек
Next.js (App Router, TypeScript) на Vercel (регион `bom1`) · Supabase Postgres через Drizzle (`postgres` driver, `prepare: false`) · grammY `Api` для исходящих вызовов · @dnd-kit · Vitest.

## Команды
- `npm test` — юнит-тесты (только `src/domain/**`, чистая логика без I/O)
- `npm run typecheck` · `npm run build`
- `npm run db:generate` / `npm run db:migrate` — миграции Drizzle

## Правила
- Секреты только в `.env.local` (gitignored). Не читать его в контекст, не коммитить, не вставлять токен в код или логи.
- `src/domain/` — без импортов БД, сети и `process.env`; всё, что можно, проверяется там юнит-тестами.
- Права проверяются на сервере (`src/domain/permissions.ts`); клиент лишь прячет кнопки.
- Часовой пояс всей логики дат — `Asia/Almaty`; дедлайн — дата без времени (`YYYY-MM-DD`).
- Весь UI и тексты бота — на русском. Исходящие сообщения бота — `parse_mode: HTML`, пользовательский текст через `escapeHtml`.
- Ошибки Telegram при отправке не должны ронять основное действие (обёртка в `src/telegram/notifier.ts`).
