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
implemented so far. Phase 1 (scaffold, database schema, config, health check,
Swagger, seed) is complete.

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

2. Start the stack (database + app). The app container runs migrations on start:

   ```sh
   docker compose up -d --build
   ```

3. Seed the database (roles, plans, admin user, provider templates):

   ```sh
   docker compose exec app npx prisma db seed
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
| `DATABASE_URL`       | PostgreSQL connection string                                 | `postgresql://echogpt:echogpt@localhost:5432/echogpt?schema=public` |
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

More endpoints are added in later phases.

## Running tests

```sh
npm run test        # unit tests
npm run test:e2e    # end-to-end tests (needs a test database)
npm run lint        # linter
npm run build       # compile
```

## Assumptions

- Used Prisma 6 instead of Prisma 7 to avoid ESM/CJS compatibility issues with
  NestJS.
- NestJS 12 ships with Vitest (not Jest) and oxlint (not ESLint) by default. I
  kept the generated test and lint tooling instead of swapping it out.
- Account deletion behaviour is documented under "Known limitations" once the
  user module lands in Phase 3.

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
  official documentation but were **not** tested against the live APIs, because
  no API keys were available. A mock adapter answers requests when
  `AI_MOCK_MODE=true` or when a provider has no key configured.
- Refresh-token reuse detection (token families) is not implemented.

## What was not built

- No real payment processing: subscription upgrades are simulated.
- No live web crawling for the search feature.
