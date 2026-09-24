import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Res, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { AuthError } from '../auth/auth.service.js';
import { Auth, Meta, Roles, Upload } from '../auth/guards.js';
import type { AuthContext, RequestMeta } from '../auth/auth.types.js';
import { EvidenceService } from './evidence.service.js';
import { MAX_EVIDENCE_BYTES } from './file-types.js';

/** The part of multer's file object this route uses (memory storage). */
type UploadedEvidence = { originalname: string; buffer: Buffer };

const uuid = new ParseUUIDPipe({ errorHttpStatusCode: 404 });
const CODE = /^\d+-\d+-\d+$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

@Controller('evidence')
export class EvidenceController {
  constructor(private readonly evidence: EvidenceService) {}

  @Get()
  list(@Auth() auth: AuthContext, @Query('control') control?: string) {
    if (control !== undefined && !CODE.test(control)) throw new AuthError('invalid_input');
    return this.evidence.list(auth, control);
  }

  @Get('summary')
  summary(@Auth() auth: AuthContext) {
    return this.evidence.summary(auth);
  }

  @Roles('ADMIN', 'CONTROL_OWNER')
  @Upload()
  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_EVIDENCE_BYTES, files: 1, fields: 5 } }))
  upload(
    @Auth() auth: AuthContext,
    @UploadedFile() file: UploadedEvidence | undefined,
    @Body() body: Record<string, string | undefined>,
    @Meta() meta: RequestMeta,
  ) {
    const title = (body.title ?? '').trim();
    const controlCode = body.controlCode ?? '';
    const expiresOn = body.expiresOn || null;
    if (!file || !CODE.test(controlCode) || title.length < 2 || title.length > 200) throw new AuthError('invalid_input');
    if (expiresOn !== null && !(DATE.test(expiresOn) && !Number.isNaN(Date.parse(`${expiresOn}T00:00:00Z`)))) throw new AuthError('invalid_input');
    return this.evidence.upload(auth, { controlCode, title, expiresOn, file }, meta);
  }

  @Get(':id/file')
  async download(@Auth() auth: AuthContext, @Param('id', uuid) id: string, @Meta() meta: RequestMeta, @Res({ passthrough: true }) res: Response) {
    const { row, stream } = await this.evidence.open(auth, id, meta);
    res.set({
      'Content-Type': row.mimeType,
      'Content-Length': String(row.size),
      // Always a download, never rendered inline on our origin.
      'Content-Disposition': `attachment; filename="evidence"; filename*=UTF-8''${encodeURIComponent(row.fileName)}`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    });
    return new StreamableFile(stream);
  }

  @Roles('ADMIN', 'CONTROL_OWNER')
  @Post(':id/remove')
  @HttpCode(204)
  async remove(@Auth() auth: AuthContext, @Param('id', uuid) id: string, @Meta() meta: RequestMeta) {
    await this.evidence.remove(auth, id, meta);
  }
}
