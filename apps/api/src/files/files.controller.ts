import { Controller, Delete, Get, Param, Post, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { memoryStorage } from 'multer';
import { AuthUser, ClientIp, CurrentUser, Roles } from '../common/decorators';
import { PLACEMENT_CELL, Role } from '../common/constants';
import { MAX_FILE_BYTES } from './file-type';
import { FilesService } from './files.service';

@ApiTags('files')
@Controller('files')
export class FilesController {
  constructor(private readonly svc: FilesService) {}

  /** Upload a certificate scan. Returns an id to pass as `fileId` when submitting certification evidence. */
  @Roles(Role.Student)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('certificates')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: 0 } }))
  upload(@CurrentUser() u: AuthUser, @UploadedFile() file: Express.Multer.File | undefined, @ClientIp() ip: string) {
    return this.svc.storeCertificate(u, file, ip);
  }

  @Roles(Role.Student)
  @Get('mine/unattached')
  unattached(@CurrentUser() u: AuthUser) {
    return this.svc.listUnattached(u);
  }

  @Roles(Role.Student, Role.Faculty, ...PLACEMENT_CELL, Role.Admin)
  @Get(':id')
  async download(@CurrentUser() u: AuthUser, @Param('id') id: string, @Res() res: Response) {
    const f = await this.svc.readForDownload(u, id);
    const inline = f.mimeType !== 'application/pdf'; // images preview in place; PDFs download
    const ascii = f.originalName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
    res
      .status(200)
      .set({
        'Content-Type': f.mimeType,
        'Content-Length': String(f.data.length),
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(f.originalName)}`,
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'Cache-Control': 'private, no-store',
      })
      .send(f.data);
  }

  @Roles(Role.Student)
  @Delete(':id')
  remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.removeUnattached(u, id);
  }
}
