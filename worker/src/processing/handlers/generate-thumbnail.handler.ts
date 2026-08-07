import { Injectable, Logger } from '@nestjs/common';
import { StorageService } from '../../storage/storage.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { JobHandler, JobMessage } from './job.handler.js';
import { createRenderHtml } from './thumbnail-render.html.js';
import { createServer as createHttpServer, IncomingMessage, ServerResponse } from 'node:http';
import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, join, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';

const THREE_ROOT = resolve('node_modules/three');

@Injectable()
export class GenerateThumbnailHandler implements JobHandler {
  private readonly logger = new Logger(GenerateThumbnailHandler.name);

  constructor(
    private readonly storage: StorageService,
    private readonly prisma: PrismaService,
  ) {}

  async handle(message: JobMessage): Promise<void> {
    this.logger.log(`Downloading ${message.storageKey}`);
    const modelBuffer = await this.storage.download(message.storageKey);

    const projectId = message.storageKey.split('/')[1];
    const thumbnailKey = `thumbnails/${projectId}/${message.modelId}_thumb.png`;

    const ext = message.format.toLowerCase();
    const modelFileName = `model.${ext}`;

    const tempDir = mkdtempSync(join(tmpdir(), 'thumb-'));
    writeFileSync(join(tempDir, modelFileName), modelBuffer);

    let hasMtl = false;

    if (message.refStorageKeys?.length) {
      await this.downloadRefFiles(message.refStorageKeys, tempDir);
    }

    if (ext === 'gltf') {
      await this.resolveGltfReferences(modelBuffer, tempDir, message.storageKey);
    }

    if (ext === 'obj') {
      hasMtl = this.resolveObjReferences(tempDir, modelBuffer);
    }

    const puppeteer = await import('puppeteer');
    const browser = await puppeteer.launch({
      headless: 'shell',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    });

    const server = createHttpServer((req: IncomingMessage, res: ServerResponse) => {
      const url = req.url!;

      if (url === '/favicon.ico') { res.writeHead(204); res.end(); return; }

      if (url === '/render.html') {
        const html = createRenderHtml(`/model/${modelFileName}`, ext, { hasMtl });
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);
        return;
      }

      if (url.startsWith('/model/')) {
        const filePath = join(tempDir, url.slice('/model/'.length));
        if (!filePath.startsWith(tempDir)) { res.writeHead(403); res.end('Forbidden'); return; }
        const mime = mimeType(filePath);
        if (existsSync(filePath)) { res.writeHead(200, { 'Content-Type': mime }); res.end(readFileSync(filePath)); return; }
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

      const page = await browser.newPage();
      const consoleLogs: string[] = [];
      page.on('console', msg => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
      page.on('pageerror', err => consoleLogs.push(`[PAGE_ERROR] ${(err as Error).message}`));

      await page.setViewport({ width: 512, height: 512 });
      await page.goto(`http://127.0.0.1:${port}/render.html`, { waitUntil: 'networkidle0' });

      await page.waitForSelector('#done, #error', { timeout: 90000 });
      const hasError = await page.$('#error');
      if (hasError) {
        const errMsg = await page.evaluate(el => el.textContent, hasError);
        this.logger.warn(`Page logs: ${consoleLogs.join(' | ')}`);
        throw new Error(`Render failed: ${errMsg}`);
      }

      const pngBuffer = await page.evaluate(() => {
        const canvas = document.querySelector('canvas');
        if (!canvas) throw new Error('No canvas found');
        return canvas.toDataURL('image/png').split(',')[1];
      });

      if (!pngBuffer || pngBuffer.length < 100) {
        this.logger.warn(`Page logs: ${consoleLogs.join(' | ')}`);
        throw new Error(`Thumbnail too small: ${pngBuffer?.length ?? 0} bytes`);
      }

      const thumbnail = Buffer.from(pngBuffer, 'base64');
      await this.storage.upload(thumbnail, thumbnailKey, 'image/png');
      await this.prisma.model3D.update({
        where: { id: message.modelId },
        data: { thumbnailKey, status: 'READY' },
      });

      this.logger.log(`Uploaded thumbnail ${thumbnailKey} (${thumbnail.length} bytes)`);
    } catch (err) {
      await this.prisma.model3D.update({
        where: { id: message.modelId },
        data: { status: 'ERROR' },
      });
      throw err;
    } finally {
      server.close();
      await browser.close();
      try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
    }
  }

  private async resolveGltfReferences(buffer: Buffer, tempDir: string, storageKey: string): Promise<void> {
    const gltf = JSON.parse(buffer.toString('utf-8'));
    const basePath = dirname(storageKey);

    const uris = new Set<string>();
    if (gltf.buffers) for (const b of gltf.buffers) { if (b.uri && !b.uri.startsWith('data:') && !b.uri.startsWith('http')) uris.add(b.uri); }
    if (gltf.images) for (const i of gltf.images) { if (i.uri && !i.uri.startsWith('data:') && !i.uri.startsWith('http')) uris.add(i.uri); }

    for (const uri of uris) {
      const refKey = `${basePath}/${uri}`;
      if (await this.storage.keyExists(refKey)) {
        const refBuf = await this.storage.download(refKey);
        writeFileSync(join(tempDir, uri), refBuf);
        this.logger.log(`Resolved GLTF reference: ${uri}`);
      } else {
        this.logger.warn(`GLTF reference not found: ${refKey}`);
      }
    }
  }

  private resolveObjReferences(tempDir: string, buffer: Buffer): boolean {
    const objText = buffer.toString('utf-8');
    const mtlMatch = objText.match(/^mtllib\s+(.+)$/im);
    if (!mtlMatch) return false;

    const mtlFileName = mtlMatch[1].trim().split(/[\\/]/).pop() || mtlMatch[1].trim();
    const mtlPath = join(tempDir, mtlFileName);

    if (!existsSync(mtlPath)) {
      this.logger.warn(`OBJ references MTL but not found in temp dir: ${mtlFileName}`);
      return false;
    }

    this.logger.log(`Found MTL: ${mtlFileName}`);
    return true;
  }

  private async downloadRefFiles(refStorageKeys: string[], tempDir: string): Promise<void> {
    for (const key of refStorageKeys) {
      try {
        const buf = await this.storage.download(key);
        const fileName = basename(key);
        writeFileSync(join(tempDir, fileName), buf);
        this.logger.log(`Downloaded ref file: ${fileName}`);
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
    case 'obj': return 'text/plain';
    case 'mtl': return 'text/plain';
    case 'fbx': return 'application/octet-stream';
    case 'js': return 'application/javascript';
    default: return 'application/octet-stream';
  }
}
