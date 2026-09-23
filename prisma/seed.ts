import { PrismaClient, ProviderType, RoleName, PlanName } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// Seeds the data the app needs to run: roles, plans, an admin user and a
// few disabled provider templates. Safe to run more than once.
async function main(): Promise<void> {
  const userRole = await prisma.role.upsert({
    where: { name: RoleName.USER },
    update: {},
    create: { name: RoleName.USER },
  });

  const adminRole = await prisma.role.upsert({
    where: { name: RoleName.ADMIN },
    update: {},
    create: { name: RoleName.ADMIN },
  });

  await prisma.plan.upsert({
    where: { name: PlanName.FREE },
    update: {},
    create: { name: PlanName.FREE, dailyLimit: 20, pricePerMonth: 0 },
  });

  await prisma.plan.upsert({
    where: { name: PlanName.PREMIUM },
    update: {},
    create: { name: PlanName.PREMIUM, dailyLimit: 500, pricePerMonth: 999 },
  });

  const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@example.com';
  const adminPassword = process.env.ADMIN_PASSWORD ?? 'admin12345';
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  const freePlan = await prisma.plan.findUnique({
    where: { name: PlanName.FREE },
  });

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash,
      name: 'Admin',
      emailVerified: true,
      roleId: adminRole.id,
    },
  });

  // Give the admin an active FREE subscription if they do not have one yet.
  const adminSubscription = await prisma.subscription.findFirst({
    where: { userId: admin.id },
  });
  if (!adminSubscription && freePlan) {
    await prisma.subscription.create({
      data: { userId: admin.id, planId: freePlan.id },
    });
  }

  // Disabled provider templates with empty encrypted keys. They exist so the
  // admin UI has rows to show; real keys are added per user later.
  const templates: { type: ProviderType; label: string }[] = [
    { type: ProviderType.OPENAI, label: 'OpenAI (template)' },
    { type: ProviderType.CLAUDE, label: 'Claude (template)' },
    { type: ProviderType.GEMINI, label: 'Gemini (template)' },
  ];

  for (const template of templates) {
    const existing = await prisma.aiProvider.findFirst({
      where: { userId: admin.id, label: template.label },
    });
    if (!existing) {
      await prisma.aiProvider.create({
        data: {
          userId: admin.id,
          type: template.type,
          label: template.label,
          apiKeyCipher: '',
          apiKeyIv: '',
          apiKeyTag: '',
          isEnabled: false,
          isDefault: false,
        },
      });
    }
  }

  console.log(
    `Seed complete. Roles: ${userRole.name}/${adminRole.name}. Admin: ${adminEmail}`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
