# Деплой на Vercel

Прод: https://kanbot-ruby.vercel.app (Vercel-проект `kanbot`, регион `bom1`, Mini App `/app`, админка `/admin`).

GitHub-интеграция Vercel **не подключена** (`vercel git connect` падает), поэтому `git push` деплой не запускает. Деплой — только через CLI.

## Как задеплоить

Из корня проекта, по порядку:

1. Если менялась схема БД (`src/db/schema.ts`): `npm run db:generate`, затем `npm run db:migrate`. Миграцию накатываем **до** выкладки кода, она должна быть аддитивной (новый код ждёт новые таблицы и колонки, старый код их не замечает).
2. `npm test`, `npm run typecheck`, `npm run build` — всё должно проходить.
3. Закоммитить и запушить в `main` (`git push origin main`): деплоить стоит из актуального `main`.
4. Деплой:

```
VERCEL_TOKEN="$(cat ~/.vercel-token)" npx --yes vercel deploy --prod --yes
```

5. Проверить, что прод обновился: новый или изменённый маршрут без авторизации должен отвечать `401`, а не `404`. Например:
   `curl -s -o /dev/null -w "%{http_code}\n" https://kanbot-ruby.vercel.app/api/app/tasks/1/history` → `401`.

## Заметки

- Токен Vercel лежит в `~/.vercel-token` (`C:\Users\BMG\.vercel-token`), вне репозитория. В чат, память и файлы проекта его не копировать. Без `VERCEL_TOKEN` CLI отвечает `Not authorized`, если не выполнен `vercel login`.
- Если деплой отвечает `Not authorized`, `permission to create a Production Deployment` или `token ... is not valid`, токен просрочен или отозван. Нужно создать новый на https://vercel.com/account/tokens (с доступом к команде проекта) и записать его в `~/.vercel-token` без перевода строки.
- Проект привязан (`.vercel/`, в `.gitignore`). CLI заливает локальные файлы, коммит для деплоя не нужен.
- Переменные окружения прода лежат в Vercel (Project → Settings → Environment Variables); `.env.local` только для локальной работы и миграций.
- Прод-деплой Claude Code может блокироваться режимом разрешений: тогда команду запускает пользователь. В `.claude/settings.json` разрешён `npx vercel deploy`.
- Webhook бота не меняется при деплое. Менять его нужно только при смене домена: `npm run webhook:set`.
