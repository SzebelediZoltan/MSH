import { resolve } from 'node:path';
import { config } from 'dotenv';

config({
  path: [resolve(process.cwd(), '../.env'), resolve(process.cwd(), '.env')],
});

export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Set it in the .env file or in the environment.`,
    );
  }
  return value;
}
