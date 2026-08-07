import type { RabbitMQConfig } from './rabbitmq.types.js';
import { requiredEnv } from '../config/env.js';

export const RABBITMQ_DEFAULT_CONFIG: RabbitMQConfig = {
  url: requiredEnv('RABBITMQ_URL'),
  exchange: 'model_events',
  queue: 'model_processing',
};

export const ROUTING_KEYS = {
  OPTIMIZE: 'model.OPTIMIZE',
  CONVERT: 'model.CONVERT',
  GENERATE_THUMBNAIL: 'model.GENERATE_THUMBNAIL',
} as const;
