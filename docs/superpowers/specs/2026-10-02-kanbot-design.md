# kanbot — дизайн

Дата: 2026-10-02
Статус: на ревью

## 1. Цель

Telegram-бот, который превращает сообщения в групповом чате в задачи, и Mini App с канбан-доской (Todo / In progress / Done) для каждой подключённой группы. Админка на отдельной веб-странице подключает чаты и задаёт, кто может ставить задачи.

Успех: в тестовой группе `/task @user текст` создаёт карточку в Todo; исполнитель открывает доску из чата, перетаскивает карточку, комментирует, а «Показать в чате» приводит его к исходному сообщению.

## 2. Стек и окружение

- **Next.js (App Router, TypeScript)** — один проект: Mini App, админка, API, webhook бота.
- **Vercel** — проект `kanbot`, связан с GitHub `imangali01/kanbot`. Локального docker нет; разработка = деплой на Vercel.
- **Supabase Postgres** через **Drizzle ORM** (transaction pooler, порт 6543). Supabase SDK не используем — переносимость сохраняется. База в регионе `ap-south-1` (Мумбаи), поэтому функции Vercel запускаются в регионе `bom1` (`vercel.json` → `regions`), иначе каждый запрос к БД идёт через океан.
- **grammY** — обработка апдейтов Telegram в режиме webhook.
- **@dnd-kit** — drag & drop.
- **Vercel Cron** — ежедневный дайджест.
- **Vitest** — юнит-тесты.
- Бот: `@t8981_bot`. Текущий webhook (Google Apps Script) заменяется на kanbot при первом деплое.
- Часовой пояс всего бота: `Asia/Almaty` (UTC+5).
- Язык интерфейса: только русский.

### Переменные окружения

| Имя | Назначение |
|---|---|
| `TELEGRAM_BOT_TOKEN` | токен бота |
| `TELEGRAM_WEBHOOK_SECRET` | проверка заголовка `X-Telegram-Bot-Api-Secret-Token` |
| `TELEGRAM_MINIAPP_SHORT_NAME` | short name Mini App из BotFather (для ссылки `t.me/<bot>/<app>`) |
| `DATABASE_URL` | Supabase transaction pooler |
| `SUPERADMIN_IDS` | Telegram ID супер-админов через запятую |
| `CRON_SECRET` | авторизация вызова cron |
| `SESSION_SECRET` | подпись сессий админки и хеширование кодов входа |

## 3. Архитектура

```
Telegram ──webhook──▶ /api/telegram/webhook ──▶ bot handlers ──▶ domain ──▶ db
Mini App (/app) ─────▶ /api/app/*  (initData HMAC)  ──▶ domain ──▶ db
                                                      └──▶ notifier ──▶ Telegram API
Админка (/admin) ────▶ /api/admin/* (cookie-сессия) ──▶ domain ──▶ db
Vercel Cron ─────────▶ /api/cron/digest (CRON_SECRET) ──▶ notifier
```

Модули:

- `src/domain/` — чистая логика без I/O, покрыта юнит-тестами:
  - `parseTaskCommand` — разбор `/task`;
  - `permissions` — кто что может;
  - `ordering` — позиции карточек при ручном порядке;
  - `sorting` / `visibility` — сортировки и скрытие старых Done;
  - `digest` — отбор задач для дайджеста;
  - `loginThrottle` — лимиты кода входа;
  - `dates` — «завтра», «сегодня», «просрочено» в Asia/Almaty.
- `src/db/` — схема Drizzle, миграции, репозитории.
- `src/telegram/` — клиент Bot API, обработчики апдейтов, проверка `initData`, `notifier` (все исходящие сообщения).
- `src/app/` — страницы и route handlers Next.js.

## 4. Модель данных

```
chats
  id                bigint PK          -- telegram chat id
  title             text
  type              text               -- group | supergroup
  status            text               -- pending | enabled | disabled
  creators_mode     text               -- all | list (default all)
  next_task_number  int  default 1
  last_pin_message_id bigint null      -- последнее 📌 бота (см. 6.6)
  created_at        timestamptz

users
  id            bigint PK              -- telegram user id
  username      text null              -- lower-case, без @
  first_name    text
  last_name     text null
  started_bot   bool default false     -- нажимал /start в личке
  updated_at    timestamptz

chat_members                            -- кого бот видел / проверил в чате
  chat_id, user_id  PK
  is_member     bool
  checked_at    timestamptz

chat_creators                           -- allowlist при creators_mode=list
  chat_id, user_id  PK

tasks
  id                bigserial PK
  chat_id           bigint FK
  number            int                -- unique(chat_id, number)
  text              text
  status            text               -- todo | in_progress | done
  position          double precision   -- ручной порядок внутри колонки
  stars             smallint 1..5 default 1
  deadline          date not null      -- default: завтра (Asia/Almaty)
  blocked           bool default false
  blocked_reason    text null
  author_id         bigint FK users
  source_message_id bigint             -- исходное сообщение задачи
  created_at, updated_at timestamptz
  done_at           timestamptz null

task_assignees
  task_id   FK
  user_id   bigint null                -- null, пока пользователь не известен боту
  username  text null                  -- для неразрешённых @username
  unique(task_id, user_id), unique(task_id, username)

comments
  id          bigserial PK
  task_id     FK
  author_id   bigint FK users null     -- null для системных записей
  kind        text                     -- comment | system
  text        text
  created_at  timestamptz

admin_login_codes
  username      text PK
  code_hash     text
  expires_at    timestamptz
  attempts      int
  locked_until  timestamptz null

admin_sessions
  token_hash  text PK
  user_id     bigint
  expires_at  timestamptz
```

Исполнитель `@username`, которого бот ещё не видел, хранится как `username` без `user_id`. Когда пользователь с таким username проявится (сообщение, `/start`, открытие Mini App), запись связывается с `user_id`.

## 5. Бот

### 5.1 Подключение чата

- Бота добавили в группу (`my_chat_member`) → upsert `chats` со `status=pending`.
- Бота удалили → `status=disabled`.
- В чате не со статусом `enabled` бот молча игнорирует всё.
- `migrate_to_chat_id` (группа стала супергруппой) → id чата обновляется во всех таблицах, `type=supergroup`.

### 5.2 Учёт пользователей

Любое сообщение в enabled-чате → upsert `users` и `chat_members(is_member=true)`. `/start` в личке → `started_bot=true`. Ответ 403 «bot was blocked» при отправке в личку → `started_bot=false`.

### 5.3 Команда `/task`

Распознаётся `/task` и `/task@t8981_bot`.

- **В тексте**: `/task @a @b текст`. Исполнители берутся из entities `mention` (`@username`) и `text_mention` (пользователь без username). Текст задачи — сообщение без команды и упоминаний. `source_message_id` — само сообщение.
- **Ответом**: `/task @a` в ответ на сообщение. Текст задачи — `text` или `caption` исходного сообщения. Если после упоминаний в команде есть ещё текст, он дописывается к задаче новой строкой. `source_message_id` — исходное сообщение.
- Без упоминаний задача создаётся без исполнителей.
- Пустой текст → бот отвечает подсказкой по формату.
- Автор не входит в постановщики → короткий ответ «Нет прав на создание задач».

Создание задачи:
1. В транзакции берётся `number = chats.next_task_number++`.
2. `status=todo`, `position` — в начало колонки, `stars=1`, `deadline` — завтра.
3. Бот отвечает в группе на исходное сообщение: «Задача #N создана», упоминание исполнителей и URL-кнопка «Открыть доску» → `https://t.me/t8981_bot/<app>?startapp=c<chatId>_t<N>`.
4. Исполнителям с `started_bot=true` (кроме автора) уходит личное уведомление.

## 6. Mini App

### 6.1 Вход и список групп

`/app` открывается в Telegram. Каждый запрос к `/api/app/*` несёт `initData`. Сервер проверяет HMAC токеном бота и требует, чтобы `auth_date` был не старше 24 часов.

Главный экран — список enabled-чатов, где пользователь — участник. Членство проверяется `getChatMember` по каждому enabled-чату, результат кэшируется в `chat_members` на 10 минут. Параметр `startapp=c<chatId>_t<N>` сразу открывает нужную доску и карточку.

### 6.2 Доска

- Три колонки шириной ~85% экрана с горизонтальным скроллом (scroll-snap). На широком экране колонки видны рядом.
- Шапка: название группы, фильтр по исполнителю, выбор сортировки, «глазок» (показать скрытые), кнопка «Обновить».
- Карточка в списке: `#N`, текст (2 строки), звёзды, дедлайн (красный, если просрочен), аватары или инициалы исполнителей, красная метка Blocked.
- Данные загружаются при открытии и по кнопке «Обновить». Автоматического опроса нет.
- Done, у которых `done_at` старше 30 дней, скрыты. «Глазок» показывает все карточки.

### 6.3 Drag & drop

- @dnd-kit, `TouchSensor` с задержкой 250 мс и допуском 5 px: долгое нажатие поднимает карточку, обычный свайп скроллит доску. На десктопе работает `PointerSensor`.
- Карточка, поднесённая к краю экрана, автоматически прокручивает доску к соседней колонке.
- Отпускание карточки — оптимистичное обновление UI и `POST /move {status, beforeId, afterId}`. При ошибке карточка возвращается на место и показывается тост.
- Перетаскивать может только тот, у кого есть право редактирования (6.5). Чужие карточки у остальных не поднимаются.

### 6.4 Порядок и сортировка

- **Ручной** (по умолчанию) — по `position`, общий для всех. `position` при вставке — середина между соседями. Если зазор меньше 1e-6, колонка перенумеровывается.
- **По дате создания**, **по звёздам**, **по дедлайну** — сортировка на клиенте, вторичный ключ — дата создания.
- Выбранная сортировка и фильтр запоминаются у пользователя для каждой доски (`localStorage`, с try/catch).
- При не-ручной сортировке перетаскивание внутри колонки отключено. Между колонками можно; карточка встаёт в начало колонки по `position`.

### 6.5 Права (`domain/permissions`)

| Действие | Кто |
|---|---|
| Видеть доску, комментировать | участник группы |
| Создавать задачи | постановщики: все участники (`creators_mode=all`) или allowlist |
| Двигать, редактировать любую карточку | постановщики |
| Двигать, редактировать свою карточку | исполнители |
| Удалить задачу | автор, супер-админ |

Редактирование включает: текст, исполнителей, дедлайн, звёзды, блокировку. Права проверяются на сервере. Клиент только скрывает недоступные действия.

### 6.6 Карточка

Открывается bottom sheet со следующими элементами:

- Текст (редактируемый).
- Исполнители: выбор из `chat_members` чата, добавление и удаление.
- Автор и дата создания.
- Дедлайн: date picker, обязательный, очистить нельзя.
- Звёзды 1–5.
- **Blocked**: включение требует причину (непустой текст). Снять блок может редактор, причина уходит в комментарии как системная запись «Разблокировано. Причина была: …». При переходе в Done блок снимается автоматически с такой же записью.
- Комментарии: лента и поле ввода. Новый комментарий сохраняется и бот публикует его в группе ответом на `source_message_id`: «💬 Имя · #N: текст». Если исходное сообщение удалено, бот публикует комментарий без reply.
- **«Показать в чате»**:
  - супергруппа — открывается `t.me/c/<id>/<msgId>`;
  - обычная группа — бот удаляет `last_pin_message_id` (ошибки игнорируются), отправляет «📌 Задача #N» ответом на исходное сообщение, сохраняет его id и вызывает `Telegram.WebApp.close()`.
- Удаление задачи с подтверждением.

## 7. Уведомления (`telegram/notifier`)

Личные сообщения уходят только пользователям с `started_bot=true`, остальным не отправляются. Себе уведомления не отправляются: автор не получает уведомление о своём действии.

| Событие | Кому | Куда |
|---|---|---|
| Задача создана | группа | ответ на исходное сообщение (5.3) |
| Задача создана | исполнители | личка |
| Задача → Done или Blocked | автор | личка |
| Новый комментарий | группа | ответ на исходное сообщение (6.6) |
| Дайджест 09:00 | каждый исполнитель с задачами, у которых дедлайн сегодня или просрочен (не Done) | личка |

Cron: `vercel.json` → `0 4 * * *` (04:00 UTC = 09:00 Asia/Almaty) → `GET /api/cron/digest` с `Authorization: Bearer CRON_SECRET`.

## 8. Админка

- `/admin/login`: ввод username → если это супер-админ из `SUPERADMIN_IDS` с `started_bot=true`, бот присылает в личку 4-значный код. Ответ формы одинаковый в любом случае: «Если такой админ есть, код отправлен».
- Код хранится как HMAC-хеш, живёт 5 минут и даёт 5 попыток. После исчерпания попыток вход по этому username блокируется на 15 минут.
- После успешного входа выдаётся httpOnly cookie-сессия на 30 дней.
- `/admin`: список чатов (pending / enabled / disabled) с кнопками «Включить» и «Отключить».
- Для каждого чата: переключатель «Ставить задачи могут: все / выбранные» и мультиселект из `chat_members`.

## 9. Ошибки и устойчивость

- Webhook всегда быстро отвечает 200. Ошибка в обработчике логируется, Telegram не ретраит.
- Ошибки Telegram при отправке (403, «message to reply not found») обрабатываются в `notifier` и не роняют основное действие.
- Конкурентные перемещения: последний запрос побеждает. Сервер возвращает актуальную карточку, клиент применяет её.
- Невалидный или просроченный `initData` → 401, и Mini App показывает «Откройте доску заново из Telegram».

## 10. Тестирование

Vitest, только юнит-тесты на `src/domain`:

- `parseTaskCommand`: текст и ответ, `@bot`-суффикс, `mention` и `text_mention`, без исполнителей, пустой текст, caption.
- `permissions`: все строки таблицы 6.5.
- `ordering`: вставка между соседями, в начало и конец, перенумерация.
- `sorting` / `visibility`: каждая сортировка, скрытие Done старше 30 дней, фильтр по исполнителю.
- `dates` / `digest`: «завтра», «сегодня», «просрочено» на границе суток Asia/Almaty.
- `loginThrottle`: TTL, попытки, блокировка.
- `verifyInitData`: валидная подпись, подделка, просрочка.

Ручная проверка — в группе «test» (`-5186674925`) после деплоя.

## 11. Деплой (первый запуск)

1. Пуш в `imangali01/kanbot`, создание Vercel-проекта `kanbot` со связью с GitHub, env-переменные.
2. Миграции Drizzle на Supabase.
3. `setWebhook` на `https://<kanbot>.vercel.app/api/telegram/webhook` с `secret_token`. Старый webhook Google Apps Script заменяется.
4. Вы: `/start` боту, чтобы я записал ваш ID в `SUPERADMIN_IDS`; `/newapp` в @BotFather с URL `/app`, short name передаётся мне.
5. Включить группу «test» в админке и провести ручную проверку.

## 12. Вне рамок

Картинки и вложения в задачах. Автообновление доски и realtime. Синхронизация ответов в Telegram с комментариями. Разбор дедлайна и звёзд из текста сообщения. Другие языки. Локальный docker.
