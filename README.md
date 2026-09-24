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

This backend is being built in phases. See `docs/` and the git log for what is
implemented so far. Phases 1–3 (scaffold, database, config, health, Swagger,
seed, authentication, users) are complete.

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
| `AI_MOCK_MODE`       | When `true`, provider calls use the mock adapter             | `true`                                              |
| `OPENAI_API_KEY`     | Optional OpenAI key (used by provider health checks)         | empty                                               |
| `ANTHROPIC_API_KEY`  | Optional Anthropic key                                       | empty                                               |
| `GEMINI_API_KEY`     | Optional Google Gemini key                                   | empty                                               |

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

More endpoints are added in later phases.

## Running tests

```sh
npm run test        # unit tests
npm run test:e2e    # end-to-end tests (needs a test database)
npm run lint        # linter
npm run build       # compile
```

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
  API; only the last four characters are shown.
- The API is default-deny: a global auth guard protects every route unless it is
  explicitly marked public.
- Prisma parameterised queries only; no string-built SQL.

## Known limitations

- Real provider adapters (OpenAI, Anthropic, Gemini) are written from the
  official documentation. See the note below on which were tested live.
- No refresh-token **family** reuse detection: rotating revokes the old session,
  but a stolen refresh token used before the real user refreshes is not detected
  as a family-wide breach.
- The throttler uses in-memory storage, so limits are per-process and reset on
  restart. They are not shared across instances.
- IP throttling sits behind the proxy setting: if the app runs behind a reverse
  proxy without trusting `X-Forwarded-For`, every client shares one bucket.
- Expired sessions are not purged. They remain as rows (revoked/expired) until a
  cleanup job is added.

## What was not built

- No real payment processing: subscription upgrades are simulated.
- No live web crawling for the search feature.
