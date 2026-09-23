import * as Joi from 'joi';

// Validate environment variables at startup so the app fails fast on a
// missing or malformed value instead of crashing later at runtime.
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3000),
  DATABASE_URL: Joi.string().required(),
  CORS_ORIGINS: Joi.string().default(''),
  ENCRYPTION_KEY: Joi.string().required(),
  JWT_ACCESS_SECRET: Joi.string().required(),
  JWT_REFRESH_SECRET: Joi.string().required(),
  JWT_ACCESS_TTL: Joi.string().default('15m'),
  JWT_REFRESH_TTL: Joi.string().default('7d'),
  ADMIN_EMAIL: Joi.string().email().required(),
  ADMIN_PASSWORD: Joi.string().min(8).required(),
  AI_MOCK_MODE: Joi.string().valid('true', 'false').default('true'),
  OPENAI_API_KEY: Joi.string().allow('').default(''),
  ANTHROPIC_API_KEY: Joi.string().allow('').default(''),
  GEMINI_API_KEY: Joi.string().allow('').default(''),
});