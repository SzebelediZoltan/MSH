import { Injectable } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { requiredEnv } from '../config/env.js';

@Injectable()
export class StorageService {
  private readonly client: S3Client;
  private readonly presignClient: S3Client;
  private readonly bucket: string;

  constructor() {
    const endpoint = process.env.MINIO_ENDPOINT ?? 'localhost';
    const port = process.env.MINIO_PORT ?? '9000';
    const accessKey = requiredEnv('MINIO_ACCESS_KEY');
    const secretKey = requiredEnv('MINIO_SECRET_KEY');
    const useSsl = process.env.MINIO_USE_SSL === 'true';
    this.bucket = process.env.MINIO_BUCKET ?? 'msh-models';

    const publicEndpoint = process.env.MINIO_PUBLIC_ENDPOINT ?? endpoint;
    const publicPort = process.env.MINIO_PUBLIC_PORT ?? port;
    const scheme = useSsl ? 'https' : 'http';

    const credentials = {
      accessKeyId: accessKey,
      secretAccessKey: secretKey,
    };

    this.client = new S3Client({
      region: 'us-east-1',
      endpoint: `${scheme}://${endpoint}:${port}`,
      credentials,
      forcePathStyle: true,
    });

    this.presignClient = new S3Client({
      region: 'us-east-1',
      endpoint: `${scheme}://${publicEndpoint}:${publicPort}`,
      credentials,
      forcePathStyle: true,
    });
  }

  async upload(file: Buffer, key: string, contentType?: string): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: file,
      ...(contentType && { ContentType: contentType }),
    });

    await this.client.send(command);

    return key;
  }

  async download(key: string, expiresIn = 3600): Promise<string> {
    return this.getSignedUrl(key, expiresIn);
  }

  async downloadRaw(key: string): Promise<{ buffer: Buffer; contentType: string }> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    const response = await this.client.send(command);

    const chunks: Uint8Array[] = [];
    const stream = response.Body;
    if (!stream) throw new Error(`Empty response body for key: ${key}`);

    for await (const chunk of stream as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }

    return {
      buffer: Buffer.concat(chunks),
      contentType: response.ContentType ?? 'application/octet-stream',
    };
  }

  async getSignedUrl(key: string, expiresIn = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    return getSignedUrl(this.presignClient, command, { expiresIn });
  }

  async delete(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    await this.client.send(command);
  }

  async copy(sourceKey: string, destKey: string): Promise<void> {
    const command = new CopyObjectCommand({
      Bucket: this.bucket,
      CopySource: `${this.bucket}/${sourceKey}`,
      Key: destKey,
    });

    await this.client.send(command);
  }

  async moveObject(sourceKey: string, destKey: string): Promise<string> {
    await this.copy(sourceKey, destKey);
    await this.delete(sourceKey);
    return destKey;
  }
}
