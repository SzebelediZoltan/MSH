import './config/env.js';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module.js';
import { ProcessingService } from './processing/processing.service.js';
import type { JobMessage } from './processing/handlers/job.handler.js';
import { requiredEnv } from './config/env.js';
import * as amqp from 'amqplib';

const logger = new Logger('Worker');

let connection: amqp.ChannelModel | null = null;
let channel: amqp.Channel | null = null;
let activeJobs = 0;
let shuttingDown = false;

function validateMessage(data: unknown): data is JobMessage {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  return (
    typeof obj.jobId === 'string' &&
    obj.jobId.length > 0 &&
    typeof obj.modelId === 'string' &&
    obj.modelId.length > 0 &&
    typeof obj.jobType === 'string' &&
    obj.jobType.length > 0 &&
    typeof obj.storageKey === 'string' &&
    obj.storageKey.length > 0 &&
    typeof obj.fileName === 'string' &&
    typeof obj.format === 'string'
  );
}

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  await app.init();

  const processingService = app.get(ProcessingService);

  const url = requiredEnv('RABBITMQ_URL');
  const queue = 'model_processing';
  const maxRetries = 10;
  const retryDelay = 3000;

  const connectWithRetry = async (): Promise<void> => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        connection = await amqp.connect(url);
        channel = await connection.createChannel();
        await channel.assertQueue(queue, { durable: true });
        channel.prefetch(1);
        logger.log(`Connected to RabbitMQ (${url})`);

        channel.on('error', (err) => {
          logger.error(`Channel error: ${err.message}`);
        });

        channel.on('close', async () => {
          if (shuttingDown) return;
          logger.warn('Channel closed, attempting reconnect...');
          channel = null;
          await reconnect();
        });

        connection.on('error', (err) => {
          logger.error(`Connection error: ${err.message}`);
        });

        connection.on('close', async () => {
          if (shuttingDown) return;
          logger.warn('Connection lost, attempting reconnect...');
          connection = null;
          channel = null;
          await reconnect();
        });

        return;
      } catch {
        logger.warn(`RabbitMQ not available (attempt ${attempt}/${maxRetries}), retrying in ${retryDelay}ms...`);
        await new Promise((r) => setTimeout(r, retryDelay));
      }
    }
    throw new Error(`Failed to connect to RabbitMQ after ${maxRetries} attempts`);
  };

  const reconnect = async (): Promise<void> => {
    if (shuttingDown) return;
    const maxReconnectRetries = 30;
    for (let attempt = 1; attempt <= maxReconnectRetries; attempt++) {
      try {
        logger.log(`Reconnect attempt ${attempt}/${maxReconnectRetries}...`);
        connection = await amqp.connect(url);
        channel = await connection.createChannel();
        await channel.assertQueue(queue, { durable: true });
        channel.prefetch(1);
        logger.log('Reconnected to RabbitMQ');
        startConsumer();
        return;
      } catch {
        logger.warn(`Reconnect failed (attempt ${attempt}/${maxReconnectRetries}), retrying in ${retryDelay}ms...`);
        await new Promise((r) => setTimeout(r, retryDelay));
      }
    }
    logger.error('Failed to reconnect after max retries, shutting down...');
    process.exit(1);
  };

  const startConsumer = (): void => {
    if (!channel) return;

    channel.consume(queue, async (msg) => {
      if (!msg) return;
      if (shuttingDown) {
        channel?.nack(msg, false, true);
        return;
      }

      const content = msg.content.toString();
      let message: JobMessage;

      try {
        const parsed: unknown = JSON.parse(content);
        if (!validateMessage(parsed)) {
          logger.error(`Invalid message format, discarding: ${content.slice(0, 200)}`);
          channel?.ack(msg);
          return;
        }
        message = parsed;
      } catch {
        logger.error(`Malformed JSON, discarding: ${content.slice(0, 200)}`);
        channel?.ack(msg);
        return;
      }

      logger.log(`Received job: ${message.jobId} [${message.jobType}]`);
      activeJobs++;

      try {
        await processingService.processJob(message);
        channel?.ack(msg);
      } catch (error) {
        logger.error(`Failed to process job ${message.jobId}: ${error}`);
        channel?.nack(msg, false, false);
      } finally {
        activeJobs--;
        if (shuttingDown && activeJobs === 0) {
          logger.log('All jobs finished, completing shutdown');
          await gracefulShutdown(app);
        }
      }
    });

    logger.log(`Listening on queue: ${queue}`);
  };

  await connectWithRetry();
  startConsumer();

  const gracefulShutdown = async (app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>>): Promise<void> => {
    shuttingDown = true;
    logger.log(`Shutting down... (${activeJobs} active jobs)`);

    if (activeJobs > 0) {
      logger.log('Waiting for active jobs to finish...');
      while (activeJobs > 0) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    try {
      await channel?.close();
    } catch { /* already closed */ }
    try {
      await connection?.close();
    } catch { /* already closed */ }
    await app.close();
    logger.log('Shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => gracefulShutdown(app));
  process.on('SIGINT', () => gracefulShutdown(app));
}

bootstrap().catch((err) => {
  logger.error(`Worker failed to start: ${err}`);
  process.exit(1);
});
