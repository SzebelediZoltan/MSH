import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import * as path from 'node:path';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service.js';
import { CreateModelDto } from './dto/create-model.dto.js';
import { UpdateModelDto } from './dto/update-model.dto.js';
import { ModelQueryDto } from './dto/model-query.dto.js';

@Injectable()
export class ModelsService {
  private readonly logger = new Logger(ModelsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly rabbitmq: RabbitMQService,
  ) {}

  async findAll(userId: string, query?: ModelQueryDto) {
    return this.prisma.model3D.findMany({
      where: {
        userId,
        ...(query?.projectId && { projectId: query.projectId }),
        ...(query?.status && { status: query.status }),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, userId: string) {
    const model = await this.prisma.model3D.findFirst({
      where: { id, userId },
    });
    if (!model) throw new NotFoundException(`Model ${id} not found`);
    return model;
  }

  async upload(files: Express.Multer.File[], dto: CreateModelDto, userId: string) {
    const modelExts = ['glb', 'gltf', 'obj', 'fbx'];
    const mainFile = files.find(f => {
      const e = path.extname(f.originalname).toLowerCase().replace('.', '');
      return modelExts.includes(e);
    }) || files[0];
    const refFiles = files.filter(f => f !== mainFile);

    const ext = (path.extname(mainFile.originalname).toLowerCase().replace('.', '') || 'unknown');
    const storageKey = `models/${dto.projectId}/${randomUUID()}.${ext}`;

    await this.storage.upload(mainFile.buffer, storageKey, mainFile.mimetype);

    const model = await this.prisma.model3D.create({
      data: {
        name: dto.name,
        fileName: mainFile.originalname,
        fileSize: mainFile.buffer.length,
        format: ext,
        storageKey,
        status: 'PROCESSING',
        projectId: dto.projectId,
        userId,
      },
    });

    const refStorageKeys: string[] = [];
    for (const rf of refFiles) {
      const refKey = `models/${dto.projectId}/${model.id}/${rf.originalname}`;
      try {
        await this.storage.upload(rf.buffer, refKey, rf.mimetype);
        refStorageKeys.push(refKey);
        this.logger.log(`Stored ref file: ${refKey}`);
      } catch (err) {
        this.logger.warn(`Failed to store ref file ${rf.originalname}: ${(err as Error).message}`);
      }
    }

    if (refStorageKeys.length) {
      await this.prisma.model3D.update({
        where: { id: model.id },
        data: { refStorageKeys },
      });
    }

    const refs = refStorageKeys.length ? refStorageKeys : undefined;
    const jobBase = { storageKey, fileName: mainFile.originalname, format: ext, refStorageKeys: refs };
    const needsConvert = ext === 'fbx' || ext === 'obj';

    if (needsConvert) {
      const convertJob = await this.prisma.job.create({
        data: { type: 'CONVERT', modelId: model.id },
      });
      this.rabbitmq.publish('model.CONVERT', { jobId: convertJob.id, modelId: model.id, jobType: 'CONVERT', ...jobBase })
        .catch((err) => this.logger.warn(`Failed to publish convert job: ${err.message}`));
    }

    const thumbJob = await this.prisma.job.create({
      data: { type: 'GENERATE_THUMBNAIL', modelId: model.id },
    });
    this.rabbitmq.publish('model.thumbnail', { jobId: thumbJob.id, modelId: model.id, jobType: 'GENERATE_THUMBNAIL', ...jobBase })
      .catch((err) => this.logger.warn(`Failed to publish thumbnail job: ${err.message}`));

    return model;
  }

  async download(id: string, userId: string) {
    const model = await this.findOne(id, userId);
    return this.storage.download(model.storageKey);
  }

  async getThumbnail(id: string, userId: string) {
    const model = await this.findOne(id, userId);
    if (!model.thumbnailKey) {
      throw new NotFoundException(`Thumbnail for model ${id} not found`);
    }
    return this.storage.downloadRaw(model.thumbnailKey);
  }

  async update(id: string, dto: UpdateModelDto, userId: string) {
    const model = await this.findOne(id, userId);
    const data: Record<string, unknown> = { ...dto };

    if (dto.projectId) {
      const project = await this.prisma.project.findFirst({
        where: { id: dto.projectId, userId },
      });
      if (!project) throw new NotFoundException(`Project ${dto.projectId} not found`);

      if (model.projectId !== dto.projectId) {
        data.storageKey = this.rebaseKey(model.storageKey, dto.projectId);
        await this.storage.moveObject(model.storageKey, data.storageKey as string);

        if (model.thumbnailKey) {
          data.thumbnailKey = this.rebaseKey(model.thumbnailKey, dto.projectId);
          try { await this.storage.moveObject(model.thumbnailKey, data.thumbnailKey as string); } catch {}
        }

        if (model.refStorageKeys) {
          const refs = model.refStorageKeys as string[];
          const newRefKeys: string[] = [];
          for (const refKey of refs) {
            const nk = this.rebaseKey(refKey, dto.projectId);
            try { await this.storage.moveObject(refKey, nk); newRefKeys.push(nk); } catch {}
          }
          if (newRefKeys.length) data.refStorageKeys = newRefKeys;
        }
      }
    }
    return this.prisma.model3D.update({ where: { id }, data });
  }

  async remove(id: string, userId: string) {
    const model = await this.findOne(id, userId);
    await this.storage.delete(model.storageKey);
    if (model.thumbnailKey) {
      await this.storage.delete(model.thumbnailKey);
    }
    if (model.refStorageKeys) {
      const refs = model.refStorageKeys as string[];
      for (const refKey of refs) {
        try { await this.storage.delete(refKey); } catch {}
      }
    }
    return this.prisma.model3D.delete({ where: { id } });
  }

  private rebaseKey(key: string, newProjectId: string): string {
    const parts = key.split('/');
    parts[1] = newProjectId;
    return parts.join('/');
  }
}
