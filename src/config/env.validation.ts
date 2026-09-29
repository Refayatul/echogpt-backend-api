import * as Joi from 'joi';

// Validate environment variables at startup so the app fails fast on a
// missing or malformed value instead of crashing later at runtime.
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3000),
  DATABASE_URL: Joi.string().required(),
  CORS_ORIGINS: Joi.string().allow('').default(''),
  ENCRYPTION_KEY: Joi.string()
    .required()
    .custom((value: string, helpers) => {
      const bytes = Buffer.from(value, 'base64');
      if (bytes.length !== 32) {
        return helpers.error('any.invalid');
      }
      return value;
    }, 'valid 32-byte base64 key')
    .messages({
      'any.invalid': 'ENCRYPTION_KEY must be a base64 string that decodes to 32 bytes',
    }),
  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_TTL: Joi.string().default('15m'),
  JWT_REFRESH_TTL: Joi.string().default('7d'),
  ADMIN_EMAIL: Joi.string().email().required(),
  ADMIN_PASSWORD: Joi.string().min(12).required(),
  AI_MOCK_MODE: Joi.string().valid('true', 'false').default('true'),
  // Provider API keys are never read from the environment: each user stores
  // their own encrypted key through POST /providers.
  SEARCH_CACHE_TTL_MINUTES: Joi.number().integer().min(1).max(10080).default(360),
});