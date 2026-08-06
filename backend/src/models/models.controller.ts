import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  Res,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { ModelsService } from './models.service.js';
import { CreateModelDto } from './dto/create-model.dto.js';
import { UpdateModelDto } from './dto/update-model.dto.js';
import { ModelQueryDto } from './dto/model-query.dto.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';

@Controller('models')
@UseGuards(JwtAuthGuard)
export class ModelsController {
  constructor(private readonly modelsService: ModelsService) {}

  @Get()
  findAll(@CurrentUser('sub') userId: string, @Query() query?: ModelQueryDto) {
    return this.modelsService.findAll(userId, query);
  }

  @Post('upload')
  @UseInterceptors(AnyFilesInterceptor())
  upload(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() dto: CreateModelDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.modelsService.upload(files, dto, userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.modelsService.findOne(id, userId);
  }

  @Get(':id/download')
  async download(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const url = await this.modelsService.download(id, userId);
    res.set('Content-Type', 'text/plain');
    res.send(url);
  }

  @Get(':id/thumbnail')
  async getThumbnail(
    @Param('id') id: string,
    @CurrentUser('sub') userId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { buffer, contentType } = await this.modelsService.getThumbnail(id, userId);
    res.set('Content-Type', contentType);
    res.send(buffer);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateModelDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.modelsService.update(id, dto, userId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser('sub') userId: string) {
    return this.modelsService.remove(id, userId);
  }
}
