/**
 * Exports the OpenAPI document to docs/openapi.json and generates a Postman
 * collection from it at docs/postman_collection.json.
 *
 * Usage:
 *   npm run build && npm run export:docs
 *
 * It boots the Nest application in-process, asks the Swagger module for the
 * document it would serve, and writes both files. Nothing is fetched over the
 * network and no server needs to be running first, so this works in CI.
 *
 * It runs against the COMPILED output (dist/) via ts-node, not tsx. Under tsx,
 * esbuild's transform makes the emitted decorator metadata resolve
 * ProvidersService's PrismaService dependency to undefined and the DI graph
 * fails to build. ts-node compiles with the project's real tsconfig, matching
 * how the app actually runs.
 */
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { AppModule } from '../src/app.module';

/** Fills {{baseUrl}} and {{accessToken}} in the generated Postman collection. */
const DEFAULT_BASE_URL = 'http://localhost:3000/api/v1';

/**
 * Requests in these folders are the ones a reviewer would run first, so they
 * are placed at the top of the collection and carry a saved example body.
 */
const EXAMPLE_BODIES: Record<string, unknown> = {
  'auth/register': {
    email: 'user@example.com',
    password: 'a-strong-password',
    name: 'Ada',
  },
  'auth/login': { email: 'user@example.com', password: 'a-strong-password' },
  'auth/refresh': { refreshToken: '<refreshToken>' },
  'auth/verify-email': { token: '<emailVerificationToken>' },
  'users/change-password': {
    currentPassword: 'a-strong-password',
    newPassword: 'an-even-stronger-password',
  },
  'users/update-profile': { name: 'Ada Lovelace' },
  'subscriptions/upgrade': { plan: 'PREMIUM' },
  'providers/create': {
    type: 'GEMINI',
    label: 'My Gemini',
    model: 'gemini-2.5-flash',
    apiKey: 'your-provider-key',
    isDefault: true,
  },
  'providers/update': { label: 'Renamed provider', isEnabled: true },
  'chat/send': { prompt: 'Explain closures in one paragraph.' },
  'search/query': { q: 'nestjs', limit: 5 },
  'admin/set-role': { role: 'ADMIN' },
  'admin/set-status': { disabled: true },
};

/** Endpoints that need no Authorization header. */
const PUBLIC_PATHS = new Set(['/health', '/auth/register', '/auth/login', '/auth/refresh', '/auth/verify-email']);

interface OpenApiDocument {
  openapi: string;
  info: { title: string; version: string; description?: string };
  servers?: { url: string }[];
  paths: Record<
    string,
    Record<
      string,
      {
        summary?: string;
        description?: string;
        tags?: string[];
        parameters?: {
          name: string;
          in: string;
          required?: boolean;
          schema?: Record<string, unknown>;
        }[];
        requestBody?: { content?: Record<string, { schema?: { $ref?: string } }> };
        responses?: Record<string, { description?: string }>;
      }
    >
  >;
  components?: { schemas?: Record<string, unknown> };
}

async function exportOpenApi(): Promise<OpenApiDocument> {
  // logger: ['error'] rather than false: a silent non-zero exit is impossible
  // to diagnose, and a DI failure here is the single most likely error.
  const app = await NestFactory.create(AppModule, { logger: ['error'] });
  const config = new DocumentBuilder()
    .setTitle('EchoGPT Backend API')
    .setDescription(
      'REST API for the EchoGPT multi-provider AI chat extension. ' +
        'Authenticate with POST /auth/login and send the returned accessToken as a Bearer token.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .addServer(DEFAULT_BASE_URL, 'Local development')
    .build();

  const doc = SwaggerModule.createDocument(app, config) as OpenApiDocument;
  // The database connection opened while building the DI graph is not needed
  // once the document exists, and the process must exit so the script can run
  // unattended.
  await app.close().catch(() => undefined);
  return doc;
}

function toPostman(doc: OpenApiDocument): unknown {
  const items: unknown[] = [];
  const byFolder = new Map<string, unknown[]>();

  for (const [path, methods] of Object.entries(doc.paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      if (method === 'parameters' || method === 'servers') {
        continue;
      }

      const tag = operation.tags?.[0] ?? 'default';
      const key = `${tag}/${method}:${path}`;

      const headers: { key: string; value: string; type: string }[] = [
        { key: 'Content-Type', value: 'application/json', type: 'text' },
      ];
      if (!PUBLIC_PATHS.has(path)) {
        headers.push({ key: 'Authorization', value: '{{accessToken}}', type: 'text' });
      }

      // Path parameters become Postman path variables.
      const pathVariables = (operation.parameters ?? [])
        .filter((p) => p.in === 'path')
        .map((p) => ({
          key: p.name,
          value: p.schema?.default ?? (p.name === 'id' ? '{{userId}}' : 'replace-me'),
          description: p.required ? 'required' : 'optional',
        }));

      const query = (operation.parameters ?? [])
        .filter((p) => p.in === 'query')
        .map((p) => ({
          key: p.name,
          value: String(p.schema?.default ?? ''),
          disabled: !p.required,
          description: p.required ? 'required' : 'optional',
        }));

      const request: Record<string, unknown> = {
        method: method.toUpperCase(),
        header: headers,
        url: {
          raw: `{{baseUrl}}${path}`,
          host: ['{{baseUrl}}'],
          path: path.split('/').filter(Boolean),
        },
        description:
          (operation.summary ?? '') +
          (operation.description ? `\n\n${operation.description}` : ''),
      };

      if (query.length > 0) {
        (request.url as Record<string, unknown>).query = query;
      }
      if (pathVariables.length > 0) {
        (request.url as Record<string, unknown>).variable = pathVariables;
      }

      const example = EXAMPLE_BODIES[key];
      if (operation.requestBody && example) {
        request.body = {
          mode: 'raw',
          raw: JSON.stringify(example, null, 2),
          options: { raw: { language: 'json' } },
        };
      }

      const folder = byFolder.get(tag) ?? [];
      folder.push({ name: `${method.toUpperCase()} ${path}`, request });
      byFolder.set(tag, folder);
    }
  }

  for (const [tag, requests] of byFolder) {
    items.push({ name: tag, item: requests });
  }

  return {
    info: {
      name: `${doc.info.title} (${doc.info.version})`,
      description: doc.info.description,
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    variable: [
      { key: 'baseUrl', value: DEFAULT_BASE_URL, type: 'string' },
      {
        key: 'accessToken',
        value: 'paste the accessToken from POST /auth/login here',
        type: 'string',
      },
    ],
    item: items,
  };
}

async function main(): Promise<void> {
  const doc = await exportOpenApi();
  const postman = toPostman(doc);
  const docsDir = join(__dirname, '..', 'docs');
  mkdirSync(docsDir, { recursive: true });

  const openApiPath = join(docsDir, 'openapi.json');
  writeFileSync(openApiPath, `${JSON.stringify(doc, null, 2)}\n`);

  const postmanPath = join(docsDir, 'postman_collection.json');
  writeFileSync(postmanPath, `${JSON.stringify(postman, null, 2)}\n`);

  const pathCount = Object.keys(doc.paths).length;
  const opCount = Object.values(doc.paths).reduce(
    (sum, methods) =>
      sum + Object.keys(methods).filter((m) => !['parameters', 'servers'].includes(m)).length,
    0,
  );
  const folderCount = (postman as { item: unknown[] }).item.length;
  console.log(`Wrote ${openApiPath}`);
  console.log(`  ${pathCount} paths / ${opCount} operations`);
  console.log(`Wrote ${postmanPath}`);
  console.log(`  ${folderCount} folders`);

  // The Prisma client keeps the event loop alive; exit once the files are out.
  process.exit(0);
}

main().catch((error) => {
  // The export runs in CI where a silent non-zero exit is impossible to debug,
  // so the whole error and its cause chain are printed.
  console.error('export-docs failed:', error);
  if (error instanceof Error && error.cause) {
    console.error('caused by:', error.cause);
  }
  process.exit(1);
});
