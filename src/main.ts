import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Injectable } from '@nestjs/common';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';

// A constructor-injected service, used only as a metadata probe. It is never
// registered with Nest.
@Injectable()
class ProbeService {
  constructor(readonly prisma: PrismaService) {}
}

// Fail fast with a readable message instead of an obscure
// UndefinedDependencyException. Some TS runners (notably tsx/esbuild) do not
// emit the `design:paramtypes` decorator metadata that Nest resolves
// dependencies from, so every constructor argument arrives as undefined.
// Running `npx tsx src/main.ts` therefore cannot work. Use `npm run start:dev`
// (nest start), or build and run `node dist/main.js`.
if (typeof Reflect.getMetadata !== 'function') {
  throw new Error(
    'reflect-metadata was not loaded. Ensure "import \'reflect-metadata\'" runs before any decorated class is evaluated.',
  );
}

// A class with constructor dependencies always has design:paramtypes under a
// compatible runner. A @Module class has no constructor arguments, so it is
// NOT a valid probe - ProbeService is used instead.
const metadataWorks =
  Reflect.getMetadata('design:paramtypes', ProbeService) !== undefined;
if (!metadataWorks) {
  throw new Error(
    'Decorator metadata is missing, so Nest dependency injection cannot work. ' +
      'This happens under tsx/esbuild, which does not emit it. ' +
      'Run the app with `npm run start:dev` (nest start) or `node dist/main.js` instead of `npx tsx src/main.ts`.',
  );
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.use(helmet());

  // When CORS_ORIGINS is empty, no cross-origin origin is allowed. We never
  // reflect an arbitrary origin while sending credentials.
  const corsOrigins = (config.get<string>('CORS_ORIGINS') ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  app.enableCors({
    origin: corsOrigins.length > 0 ? corsOrigins : false,
    credentials: true,
  });

  app.setGlobalPrefix('api/v1');

  const swaggerConfig = new DocumentBuilder()
    .setTitle('EchoGPT Backend API')
    .setDescription('REST API for a multi-provider AI chat extension')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = config.get<number>('PORT') ?? 3000;
  await app.listen(port);
}

void bootstrap();
