import { Injectable, Logger } from '@nestjs/common';
import { StorageService } from '../../storage/storage.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { JobHandler, JobMessage } from './job.handler.js';
import { createConvertHtml } from './convert-render.html.js';
import { createServer as createHttpServer, IncomingMessage, ServerResponse } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const THREE_ROOT = resolve('node_modules/three');
const BROWSER_FORMATS = new Set(['obj', 'gltf']);
const BLENDER_FORMATS = new Set(['fbx']);

const execFileAsync = promisify(execFile);

@Injectable()
export class ConvertHandler implements JobHandler {
  private readonly logger = new Logger(ConvertHandler.name);

  constructor(
    private readonly storage: StorageService,
    private readonly prisma: PrismaService,
  ) {}

  async handle(message: JobMessage): Promise<void> {
    this.logger.log(`CONVERT: Downloading ${message.storageKey}`);
    const buffer = await this.storage.download(message.storageKey);

    const format = message.format.toLowerCase();
    if (!BROWSER_FORMATS.has(format) && !BLENDER_FORMATS.has(format)) {
      throw new Error(`Unsupported format for conversion: ${format}`);
    }

    this.logger.log(`CONVERT: Converting ${message.fileName} (${format} -> glb)`);

    const convertedKey = message.storageKey.replace(/\.[^.]+$/, '.glb');
    const converted =
      format === 'fbx'
        ? await this.convertViaBlender(buffer, message.refStorageKeys ?? [])
        : await this.convertViaBrowser(buffer, format, message.refStorageKeys ?? []);

    await this.storage.upload(converted, convertedKey, 'model/gltf-binary');

    await this.prisma.model3D.update({
      where: { id: message.modelId },
      data: { storageKey: convertedKey },
    });

    this.logger.log(`CONVERT: Uploaded converted model to ${convertedKey}`);
  }

  private async convertViaBlender(buffer: Buffer, refStorageKeys: string[]): Promise<Buffer> {
    const tempDir = mkdtempSync(join(tmpdir(), 'blender-'));
    const fbxPath = join(tempDir, 'model.fbx');
    const glbPath = join(tempDir, 'model.glb');
    writeFileSync(fbxPath, buffer);

    if (refStorageKeys.length) {
      await this.downloadRefFiles(refStorageKeys, tempDir);
    }

    const scriptPath = resolve(process.cwd(), 'scripts/fbx-to-glb.py');
    if (!existsSync(scriptPath)) {
      throw new Error(`Blender script not found: ${scriptPath}`);
    }

    this.logger.log('CONVERT: Running Blender (fbx -> glb)');
    try {
      await execFileAsync(
        'blender',
        ['--background', '--python', scriptPath, '--', fbxPath, glbPath],
        { timeout: 180_000, maxBuffer: 32 * 1024 * 1024 },
      );
      if (!existsSync(glbPath)) {
        throw new Error('Blender finished but produced no output file');
      }
      return readFileSync(glbPath);
    } catch (err) {
      throw new Error(`Blender conversion failed: ${(err as Error).message}`);
    } finally {
      try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
    }
  }

  private async convertViaBrowser(buffer: Buffer, ext: string, refStorageKeys: string[]): Promise<Buffer> {
    const tempDir = mkdtempSync(join(tmpdir(), 'convert-'));
    const modelFileName = `model.${ext}`;
    writeFileSync(join(tempDir, modelFileName), buffer);

    if (refStorageKeys.length) {
      await this.downloadRefFiles(refStorageKeys, tempDir);
    }

    let hasMtl = false;
    let mtlFileName: string | null = null;
    if (ext === 'obj') {
      mtlFileName = this.resolveObjReferences(tempDir, buffer);
      hasMtl = !!mtlFileName;
    }

    const server = createHttpServer((req: IncomingMessage, res: ServerResponse) => {
      const url = req.url!;

      if (url === '/favicon.ico') { res.writeHead(204); res.end(); return; }

      if (url === '/render.html') {
        const html = createConvertHtml(`/model/${modelFileName}`, ext, { hasMtl, mtlFileName });
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);
        return;
      }

      if (url.startsWith('/model/')) {
        const filePath = join(tempDir, url.slice('/model/'.length));
        if (!filePath.startsWith(tempDir)) { res.writeHead(403); res.end('Forbidden'); return; }
        if (existsSync(filePath)) { res.writeHead(200, { 'Content-Type': mimeType(filePath) }); res.end(readFileSync(filePath)); return; }
        res.writeHead(404); res.end('Not found');
        return;
      }

      const serveFile = (filePath: string, contentType = 'application/javascript'): boolean => {
        if (existsSync(filePath)) { res.writeHead(200, { 'Content-Type': contentType }); res.end(readFileSync(filePath)); return true; }
        return false;
      };

      if (url.endsWith('.js') && url.startsWith('/three/addons/')) {
        if (serveFile(resolve(THREE_ROOT, 'examples/jsm/', url.slice('/three/addons/'.length)))) return;
      }
      if (url.endsWith('.js') && url.startsWith('/three/')) {
        if (serveFile(resolve(THREE_ROOT, 'build/', url.slice('/three/'.length)))) return;
      }
      if (url.startsWith('/three/')) {
        const p = url.slice('/three/'.length);
        for (const base of [resolve(THREE_ROOT, 'build'), resolve(THREE_ROOT, 'examples/jsm'), resolve(THREE_ROOT, 'src')]) {
          if (serveFile(resolve(base, p))) return;
        }
      }
      res.writeHead(404); res.end('Not found');
    });

    try {
      const port = await new Promise<number>(r => server.listen(0, '127.0.0.1', () => r((server.address() as any).port)));

      const puppeteer = await import('puppeteer');
      const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
      });

      try {
        const page = await browser.newPage();
        await page.goto(`http://127.0.0.1:${port}/render.html`, { waitUntil: 'networkidle0' });

        await page.waitForSelector('#done, #error', { timeout: 90000 });
        const hasError = await page.$('#error');
        if (hasError) {
          const errMsg = await page.evaluate(el => el.textContent, hasError);
          throw new Error(`Conversion failed: ${errMsg}`);
        }

        const b64 = await page.evaluate(() => (window as any).__convertResult as string);
        if (!b64 || b64.length < 100) {
          throw new Error(`Conversion result too small: ${b64?.length ?? 0} bytes`);
        }

        return Buffer.from(b64, 'base64');
      } finally {
        await browser.close();
      }
    } finally {
      server.close();
      try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
    }
  }

  private resolveObjReferences(tempDir: string, buffer: Buffer): string | null {
    const objText = buffer.toString('utf-8');
    const mtlMatch = objText.match(/^mtllib\s+(.+)$/im);
    if (!mtlMatch) return null;

    const mtlFileName = mtlMatch[1].trim().split(/[\\/]/).pop() || mtlMatch[1].trim();
    if (!existsSync(join(tempDir, mtlFileName))) {
      this.logger.warn(`OBJ references MTL but not found in temp dir: ${mtlFileName}`);
      return null;
    }

    this.logger.log(`OBJ references MTL: ${mtlFileName}`);
    return mtlFileName;
  }

  private async downloadRefFiles(refStorageKeys: string[], tempDir: string): Promise<void> {
    for (const key of refStorageKeys) {
      try {
        const buf = await this.storage.download(key);
        const fileName = basename(key);
        writeFileSync(join(tempDir, fileName), buf);
        this.logger.log(`CONVERT: Downloaded ref file: ${fileName}`);
      } catch (err) {
        this.logger.warn(`Failed to download ref file: ${key} — ${(err as Error).message}`);
      }
    }
  }
}

function mimeType(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'glb': return 'model/gltf-binary';
    case 'gltf': return 'model/gltf+json';
    case 'bin': return 'application/octet-stream';
    case 'png': return 'image/png';
    case 'jpg': case 'jpeg': return 'image/jpeg';
    case 'gif': return 'image/gif';
    case 'webp': return 'image/webp';
    case 'obj': return 'text/plain';
    case 'mtl': return 'text/plain';
    case 'fbx': return 'application/octet-stream';
    case 'tga': return 'application/octet-stream';
    case 'dds': return 'application/octet-stream';
    case 'bmp': return 'image/bmp';
    case 'tif': case 'tiff': return 'image/tiff';
    default: return 'application/octet-stream';
  }
}
