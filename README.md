# EchoGPT Backend API

A REST API backend for a multi-provider AI chat browser extension. Built with
NestJS, PostgreSQL and Prisma as a graded internship assignment.

The API supports user accounts, subscriptions with daily usage limits, multiple
AI providers (OpenAI, Claude, Gemini), chat with conversation history, web
search, and an admin area. Full interactive API docs are served with Swagger.

## Stack

- NestJS 12 (TypeScript, strict)
- PostgreSQL 16
- Prisma 6
- Swagger / OpenAPI
- JWT authentication (access + refresh tokens)
- Docker and Docker Compose
- Node 24 LTS

## Requirements

- Node.js >= 24
- Docker and Docker Compose (for the database, and optionally the whole app)
- npm

## Project status

All seven feature areas of the assignment are implemented: authentication, user
management, subscriptions with usage limits, AI provider management, chat
(including streaming), web search, and the admin area. See the endpoint table
below and the git log for the history.

## Quick start

Generate the two secrets you need before running anything:

```sh
cp .env.example .env
# 32-byte base64 key used to encrypt provider API keys
openssl rand -base64 32          # paste into ENCRYPTION_KEY
# or leave the JWT secrets as long random strings (32+ characters required)
openssl rand -hex 32             # paste into JWT_ACCESS_SECRET
openssl rand -hex 32             # paste into JWT_REFRESH_SECRET
```

Then either run everything with Docker, or run the database in Docker and the
app locally (both options below).

## Setup

### Option A: everything with Docker

1. Copy the environment file and fill in the values:

   ```sh
   cp .env.example .env
   ```

   Generate a strong encryption key and paste it into `.env`:

   ```sh
   openssl rand -base64 32
   ```

2. Start the stack (database + a one-shot init service + app). The `init`
   service runs `prisma migrate deploy` and `prisma db seed` and exits; the app
   waits for it to finish (`service_completed_successfully`), so roles, plans and
   the admin user are present with no manual step:

   ```sh
   docker compose up -d --build
   ```

The API is then available on `http://localhost:3000`, with Swagger UI at
`http://localhost:3000/api/docs`.

### Option B: local development

1. Copy the environment file:

   ```sh
   cp .env.example .env
   ```

2. Start only the database:

   ```sh
   docker compose up -d postgres
   ```

3. Install dependencies:

   ```sh
   npm install
   ```

4. Apply migrations and generate the Prisma client:

   ```sh
   npx prisma migrate dev
   ```

5. Seed the database:

   ```sh
   npx prisma db seed
   ```

6. Start the app in watch mode:

   ```sh
   npm run start:dev
   ```

## Environment variables

| Variable             | Description                                                  | Example                                             |
| -------------------- | ------------------------------------------------------------ | --------------------------------------------------- |
| `DATABASE_URL`       | PostgreSQL connection string. Use host `localhost` for local runs and host `postgres` inside Docker Compose. | `postgresql://echogpt:echogpt@localhost:5432/echogpt?schema=public` |
| `NODE_ENV`           | Runtime environment                                          | `development`                                       |
| `PORT`               | HTTP port                                                    | `3000`                                              |
| `CORS_ORIGINS`       | Comma-separated allowed origins                              | `http://localhost:5173`                             |
| `ENCRYPTION_KEY`     | 32-byte base64 key for provider API key encryption           | output of `openssl rand -base64 32`                 |
| `JWT_ACCESS_SECRET`  | Secret for signing access tokens                             | random string                                       |
| `JWT_REFRESH_SECRET` | Secret for signing refresh tokens                            | random string                                       |
| `JWT_ACCESS_TTL`     | Access token lifetime                                        | `15m`                                               |
| `JWT_REFRESH_TTL`    | Refresh token lifetime                                       | `7d`                                                |
| `ADMIN_EMAIL`        | Email of the seeded admin user                               | `admin@example.com`                                 |
| `ADMIN_PASSWORD`     | Password of the seeded admin user                            | `change-me-please`                                  |
| `AI_MOCK_MODE`       | When `true`, chat answers come from a mock adapter and no external AI API is called | `true`                                              |
| `SEARCH_CACHE_TTL_MINUTES` | How long a cached web search stays fresh (max 10080)         | `360`                                               |

Provider API keys are **not** environment variables. Each user adds their own
key through `POST /api/v1/providers`, and it is stored encrypted. This means no
AI credential is ever committed to the repository.

Environment variables are validated at startup with Joi. The app refuses to
start if a required value is missing or malformed.

## Database

Migrate and seed commands:

```sh
npx prisma migrate dev      # create and apply a migration in development
npx prisma migrate deploy   # apply existing migrations (used in Docker)
npx prisma db seed          # seed roles, plans, admin user, provider templates
npx prisma studio           # browse the data
```

The seed script is idempotent — running it again does not create duplicates.

### Entity relationship diagram

```mermaid
erDiagram
    Role ||--o{ User : has
    User ||--o{ Session : owns
    User ||--o{ Subscription : has
    User ||--o{ UsageCounter : tracks
    User ||--o{ AiProvider : configures
    User ||--o{ Conversation : starts
    User ||--o{ WebSearch : performs
    User ||--o{ ApiUsageLog : generates
    Plan ||--o{ Subscription : includes
    Conversation ||--o{ Message : contains

    Role {
        string id PK
        string name
    }
    User {
        string id PK
        string email
        string passwordHash
        string name
        boolean emailVerified
        boolean isDisabled
        string roleId FK
    }
    Session {
        string id PK
        string userId FK
        string refreshTokenHash
        datetime expiresAt
        datetime revokedAt
    }
    Plan {
        string id PK
        string name
        int dailyLimit
        int pricePerMonth
    }
    Subscription {
        string id PK
        string userId FK
        string planId FK
        string status
        datetime startedAt
        datetime endsAt
    }
    UsageCounter {
        string id PK
        string userId FK
        datetime date
        int count
    }
    AiProvider {
        string id PK
        string userId FK
        string type
        string label
        string apiKeyCipher
        boolean isEnabled
        boolean isDefault
    }
    Conversation {
        string id PK
        string userId FK
        string provider
        string title
    }
    Message {
        string id PK
        string conversationId FK
        string role
        string content
        int tokensUsed
    }
    WebSearch {
        string id PK
        string userId FK
        string query
        string queryHash
        json results
    }
    ApiUsageLog {
        string id PK
        string userId FK
        string method
        string path
        int statusCode
        int durationMs
    }
```

## Endpoints

Swagger UI: `http://localhost:3000/api/docs`

| Method | Path                        | Description                          | Auth   |
| ------ | --------------------------- | ------------------------------------ | ------ |
| GET    | `/api/v1/health`            | Service and database health check    | Public |
| POST   | `/api/v1/auth/register`     | Register a new user                  | Public |
| POST   | `/api/v1/auth/login`        | Log in with email and password       | Public |
| POST   | `/api/v1/auth/refresh`      | Exchange a refresh token             | Public |
| POST   | `/api/v1/auth/verify-email` | Verify email with the register token | Public |
| POST   | `/api/v1/auth/logout`       | Revoke the current session           | Bearer |
| POST   | `/api/v1/auth/logout-all`   | Revoke all sessions for the user     | Bearer |
| GET    | `/api/v1/users/me`          | Get the current user profile         | Bearer |
| PATCH  | `/api/v1/users/me`          | Update the current user profile      | Bearer |
| POST   | `/api/v1/users/me/change-password` | Change password (revokes other sessions) | Bearer |
| DELETE | `/api/v1/users/me`          | Delete (disable) the account         | Bearer |
| GET    | `/api/v1/subscriptions/plans` | List the available plans           | Bearer |
| GET    | `/api/v1/subscriptions/status` | Subscription and usage for today   | Bearer |
| GET    | `/api/v1/subscriptions/remaining` | Remaining daily allowance        | Bearer |
| PATCH  | `/api/v1/subscriptions`     | Upgrade or downgrade the plan        | Bearer |
| POST   | `/api/v1/subscriptions/cancel` | Cancel the active subscription    | Bearer |
| GET    | `/api/v1/providers`         | List the user's AI providers         | Bearer |
| POST   | `/api/v1/providers`         | Add a provider (key is encrypted)    | Bearer |
| GET    | `/api/v1/providers/:id`     | Get one provider                     | Bearer |
| PATCH  | `/api/v1/providers/:id`     | Edit a provider (including the key)  | Bearer |
| DELETE | `/api/v1/providers/:id`     | Delete a provider                    | Bearer |
| POST   | `/api/v1/providers/:id/default` | Set the default provider         | Bearer |
| GET    | `/api/v1/providers/:id/health` | Provider health check             | Bearer |
| POST   | `/api/v1/chat/messages`    | Send a prompt, get the AI response   | Bearer |
| POST   | `/api/v1/chat/messages/stream` | Send a prompt, stream the response | Bearer |
| GET    | `/api/v1/chat/conversations` | List conversations                  | Bearer |
| GET    | `/api/v1/chat/conversations/:id` | Get a conversation with messages | Bearer |
| DELETE | `/api/v1/chat/conversations/:id` | Delete a conversation           | Bearer |
| POST   | `/api/v1/search`           | Run a web search                     | Bearer |
| GET    | `/api/v1/search/history`   | Full search history                  | Bearer |
| GET    | `/api/v1/search/recent`    | Most recent searches                 | Bearer |
| GET    | `/api/v1/search/suggestions` | Suggestions from past queries     | Bearer |
| DELETE | `/api/v1/search/history`   | Clear the search history             | Bearer |
| GET    | `/api/v1/admin/stats`      | Dashboard statistics                 | Admin  |
| GET    | `/api/v1/admin/users`      | List users with plan and usage       | Admin  |
| PATCH  | `/api/v1/admin/users/:id/role` | Change a user's role              | Admin  |
| PATCH  | `/api/v1/admin/users/:id/status` | Enable or disable a user       | Admin  |
| GET    | `/api/v1/admin/subscriptions` | List subscriptions                 | Admin  |
| GET    | `/api/v1/admin/providers`  | All providers across users            | Admin  |
| GET    | `/api/v1/admin/usage`      | Usage analytics over time            | Admin  |
| GET    | `/api/v1/admin/logs`       | Request logs                         | Admin  |
| GET    | `/api/v1/admin/health`     | System health                        | Admin  |

### Using a real AI provider

The default `AI_MOCK_MODE=true` returns a clearly labelled mock answer and never
calls an external API. To use a real provider:

1. Set `AI_MOCK_MODE=false` in `.env` and restart.
2. Add your key through the API (or the Swagger UI). Do **not** put it in
   `.env`:

   ```sh
   curl -X POST http://localhost:3000/api/v1/providers \
     -H "Authorization: Bearer $ACCESS_TOKEN" \
     -H 'content-type: application/json' \
     -d '{"type":"GEMINI","label":"My Gemini","model":"gemini-2.5-flash","apiKey":"YOUR_KEY","isDefault":true}'
   ```

3. Send a prompt as normal.

## Running tests

```sh
npm run test        # unit tests (Vitest)
npm run test:e2e    # end-to-end tests (needs the echogpt_test database)
npm run lint        # linter (oxlint)
npm run build       # compile
```

The e2e suite needs a separate database so it can never touch dev data:

```sh
echo "CREATE DATABASE echogpt_test;" | \
  npx prisma db execute --url "postgresql://echogpt:echogpt@localhost:5432/postgres" --stdin

env DATABASE_URL="postgresql://echogpt:echogpt@localhost:5432/echogpt_test?schema=public" \
  npx prisma migrate deploy
env DATABASE_URL="postgresql://echogpt:echogpt@localhost:5432/echogpt_test?schema=public" \
  ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=e2e-admin-password npx prisma db seed
npm run test:e2e
```

`AI_MOCK_MODE` is forced to `true` for the e2e run, so no external AI API is
contacted. Web search is the one feature the e2e suite does not call, so the
suite stays offline.

## Assumptions

- Used Prisma 6 (mature and widely documented). It is two major versions behind
the latest; I kept the project on CommonJS.
- NestJS 12 scaffolds Vitest (not Jest) and oxlint (not ESLint) by default. I
  kept them instead of swapping in another test runner or linter.
- Account deletion is a **soft delete**: the account is disabled and its
  sessions are revoked, but the row is kept for audit and foreign-key
  integrity. A hard delete would break the FK constraints from usage logs.
- Email verification is a bonus and is only stubbed: registration creates a
  one-time, expiring token and returns it in the response. A real system would
  email the token instead of returning it and would never expose it in the body.
- Access tokens are checked against the `Session` row on every request, so
  logout and logout-all take effect immediately (at the cost of one extra query
  per request).

## Security decisions

- Passwords are hashed with bcrypt at 12 rounds.
- Access tokens last 15 minutes; refresh tokens last 7 days. Only a SHA-256 hash
  of each refresh token is stored in the `Session` row.
- Provider API keys are encrypted at rest with AES-256-GCM (random 12-byte IV,
  auth tag stored, key from `ENCRYPTION_KEY`). Keys are never returned by the
  API at all — not even partially. Responses carry only a `hasApiKey` boolean.
- Keys are sent to providers in a header (`Authorization`, `x-api-key` or
  `x-goog-api-key`), never in a URL query string, so they cannot end up in proxy
  or access logs.
- Upstream error bodies are never echoed to the client. Every provider failure is
  mapped to a fixed message derived from the HTTP status code, so a misconfigured
  upstream cannot reflect a key back through an error response.
- The API is default-deny: a global auth guard protects every route unless it is
  explicitly marked public.
- Admin routes are guarded by role metadata, and a non-admin gets 403 before the
  handler runs.
- Daily quota is checked **before** the provider call, so an over-limit user
  cannot spend a paid upstream request. A rejected call rolls its usage
  increment back rather than consuming the user's remaining allowance.
- Prisma parameterised queries only; no string-built SQL.
- The global `ValidationPipe` runs with `whitelist` and `forbidNonWhitelisted`,
  so unknown request fields are rejected rather than silently ignored.

## Known limitations

- **Which providers were tested live.** **None of them.** All three adapters
  (OpenAI, Claude, Gemini) were verified only against **mocked HTTP responses**
  in unit tests, which cover the request shape, the auth header, response
  parsing and the status-code-to-error mapping. No live call was made to any
  provider, because no AI API key was available when this was written. The
  endpoints and models were taken from the current vendor documentation, but
  real-world behaviour is unverified — expect to need small fixes on first real
  use. The only outbound call actually exercised live is the web search, which
  uses a keyless DuckDuckGo endpoint.
- Streaming is not a true token stream. The upstream adapters return a complete
  response, which the streaming endpoint replays in word-sized chunks over the
  same newline-delimited contract a real token stream would use. Swapping in a
  genuinely streaming upstream later would not change the client contract.
- The web search backend is the DuckDuckGo Instant Answer API. It needs no API
  key (so the project runs out of the box) but it is an instant-answer service,
  not a general web search index, so it returns a curated summary and related
  topics rather than ranked results for every query.
- Search suggestions are derived from the user's own past queries rather than a
  separate suggestion API.
- Search cache entries are per user: a repeat query by user A never serves
  user B's cached row.
- No refresh-token **family** reuse detection: rotating revokes the old session,
  but a stolen refresh token used before the real user refreshes is not detected
  as a family-wide breach.
- The throttler uses in-memory storage, so limits are per-process and reset on
  restart. They are not shared across instances.
- IP throttling sits behind the proxy setting: if the app runs behind a reverse
  proxy without trusting `X-Forwarded-For`, every client shares one bucket.
- Expired sessions are not purged. They remain as rows (revoked/expired) until a
  cleanup job is added.
- `ApiUsageLog` rows are written by the request-logger middleware but never
  pruned, so the table grows without bound.

## What was not built

- No real payment processing: subscription upgrades are simulated by pointing
  the subscription at another plan.
- No email delivery. Registration returns the verification token in the response
  instead of emailing it.
