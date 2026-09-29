import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaService } from '../src/prisma/prisma.service';

// Exercises subscriptions, providers, chat and search over the real HTTP stack
// against the echogpt_test database. AI_MOCK_MODE is forced on for these tests,
// so no external AI API is called.
describe('Subscriptions, providers, chat and search (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `e2e2-${Date.now()}@example.com`;
  const password = 'supersecret123';
  let token: string;

  beforeAll(async () => {
    process.env.AI_MOCK_MODE = 'true';

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    prisma = app.get(PrismaService);

    const register = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password, name: 'E2E User 2' })
      .expect(201);
    token = register.body.accessToken as string;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });

  it('lists the seeded plans', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/subscriptions/plans')
      .set(auth())
      .expect(200);
    const names = response.body.plans.map((plan: { name: string }) => plan.name);
    expect(names).toContain('FREE');
    expect(names).toContain('PREMIUM');
  });

  it('grants the FREE plan on first use and reports the allowance', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/subscriptions/status')
      .set(auth())
      .expect(200);
    expect(response.body.subscription.plan.name).toBe('FREE');
    expect(response.body.remaining).toBe(20);
  });

  it('upgrades to PREMIUM and cancels the previous row', async () => {
    const response = await request(app.getHttpServer())
      .patch('/api/v1/subscriptions')
      .set(auth())
      .send({ plan: 'PREMIUM' })
      .expect(200);
    expect(response.body.plan.name).toBe('PREMIUM');
    expect(response.body.status).toBe('ACTIVE');

    const user = await prisma.user.findUnique({ where: { email } });
    const rows = await prisma.subscription.findMany({ where: { userId: user!.id } });
    expect(rows).toHaveLength(2);
    expect(rows.filter((row) => row.status === 'ACTIVE')).toHaveLength(1);
  });

  it('rejects an unknown plan', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/subscriptions')
      .set(auth())
      .send({ plan: 'GOLD' })
      .expect(400);
  });

  it('never returns the stored API key', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/providers')
      .set(auth())
      .send({
        type: 'GEMINI',
        label: 'E2E Gemini',
        model: 'gemini-2.5-flash',
        apiKey: 'AIza-e2e-fake-key-000',
      })
      .expect(201);

    expect(created.body.hasApiKey).toBe(true);
    expect(JSON.stringify(created.body)).not.toContain('AIza-e2e-fake-key-000');

    const listed = await request(app.getHttpServer())
      .get('/api/v1/providers')
      .set(auth())
      .expect(200);
    expect(JSON.stringify(listed.body)).not.toContain('AIza-e2e-fake-key-000');
  });

  it('stores the key encrypted at rest', async () => {
    const user = await prisma.user.findUnique({ where: { email } });
    const row = await prisma.aiProvider.findFirst({
      where: { userId: user!.id, label: 'E2E Gemini' },
    });
    // The plaintext key must not appear in any stored column.
    expect(row?.apiKeyCipher).not.toContain('AIza-e2e-fake-key-000');
    expect(row?.apiKeyIv.length).toBeGreaterThan(0);
    expect(row?.apiKeyTag.length).toBeGreaterThan(0);
  });

  it('only allows one default provider', async () => {
    const user = await prisma.user.findUnique({ where: { email } });
    const first = await prisma.aiProvider.create({
      data: {
        userId: user!.id,
        type: 'OPENAI',
        label: 'E2E OpenAI',
        model: 'gpt-4o-mini',
        apiKeyCipher: 'c',
        apiKeyIv: 'i',
        apiKeyTag: 't',
        isDefault: true,
      },
    });

    await request(app.getHttpServer())
      .post(`/api/v1/providers/${first.id}/default`)
      .set(auth())
      .expect(200);

    const defaults = await prisma.aiProvider.count({
      where: { userId: user!.id, isDefault: true },
    });
    expect(defaults).toBe(1);
  });

  it('sends a prompt and records the conversation', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/chat/messages')
      .set(auth())
      .send({ prompt: 'What is a closure?' })
      .expect(201);

    expect(response.body.content).toContain('MOCK RESPONSE');
    const conversationId = response.body.conversationId as string;
    expect(conversationId).toBeDefined();

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/chat/conversations/${conversationId}`)
      .set(auth())
      .expect(200);
    // The user turn and the assistant turn are both persisted.
    expect(detail.body.messages).toHaveLength(2);
    expect(detail.body.messages[0].role).toBe('USER');
    expect(detail.body.messages[1].role).toBe('ASSISTANT');
  });

  it('consumes one unit of daily usage per chat message', async () => {
    const before = await request(app.getHttpServer())
      .get('/api/v1/subscriptions/remaining')
      .set(auth())
      .expect(200);

    await request(app.getHttpServer())
      .post('/api/v1/chat/messages')
      .set(auth())
      .send({ prompt: 'again' })
      .expect(201);

    const after = await request(app.getHttpServer())
      .get('/api/v1/subscriptions/remaining')
      .set(auth())
      .expect(200);
    expect(after.body.used).toBe(before.body.used + 1);
  });

  it('rejects a chat request with no provider configured for the type', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/chat/messages')
      .set(auth())
      .send({ prompt: 'hi', providerType: 'CLAUDE' })
      .expect(400);
  });

  it('blocks non-admins from the admin endpoints', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/stats')
      .set(auth())
      .expect(403);
  });

  it('rejects an unauthenticated request', async () => {
    await request(app.getHttpServer()).get('/api/v1/subscriptions/status').expect(401);
  });
});
