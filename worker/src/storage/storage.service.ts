import { Injectable, Logger } from '@nestjs/common';
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { requiredEnv } from '../config/env.js';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    const endpoint = process.env.MINIO_ENDPOINT ?? 'localhost';
    const port = process.env.MINIO_PORT ?? '9000';
    const accessKey = requiredEnv('MINIO_ACCESS_KEY');
    const secretKey = requiredEnv('MINIO_SECRET_KEY');
    const useSsl = process.env.MINIO_USE_SSL === 'true';
    this.bucket = process.env.MINIO_BUCKET ?? 'msh-models';
    const scheme = useSsl ? 'https' : 'http';

    this.client = new S3Client({
      region: 'us-east-1',
      endpoint: `${scheme}://${endpoint}:${port}`,
      credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
      },
      forcePathStyle: true,
    });
  }

  private async withRetry<T>(fn: () => Promise<T>, operation: string): Promise<T> {
    let lastError: Error | undefined;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < MAX_RETRIES) {
          this.logger.warn(`${operation} failed (attempt ${attempt}/${MAX_RETRIES}): ${lastError.message}, retrying in ${RETRY_DELAY_MS}ms...`);
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
        }
      }
    }
    throw lastError;
  }

  async download(key: string): Promise<Buffer> {
    return this.withRetry(async () => {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const response = await this.client.send(command);
      const chunks: Uint8Array[] = [];
      const stream = response.Body;

      if (!stream) {
        throw new Error(`Empty response body for key: ${key}`);
      }

      for await (const chunk of stream as AsyncIterable<Uint8Array>) {
        chunks.push(chunk);
      }

      return Buffer.concat(chunks);
    }, `S3 download(${key})`);
  }

  async upload(buffer: Buffer, key: string, contentType?: string): Promise<void> {
    await this.withRetry(async () => {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      });

      await this.client.send(command);
      this.logger.log(`Uploaded: ${key}`);
    }, `S3 upload(${key})`);
  }

  async keyExists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch {
      return false;
    }
  }
}
