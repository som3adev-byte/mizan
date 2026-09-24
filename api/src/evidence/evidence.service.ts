import { createHash, randomUUID } from 'node:crypto';
import { ForbiddenException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuthError } from '../auth/auth.service.js';
import type { AuthContext, RequestMeta } from '../auth/auth.types.js';
import { EVIDENCE_SOON_DAYS, riyadhToday } from '../alerts/alerts.service.js';
import { EvidenceStorage } from './storage.js';
import { cleanFileName, evidenceType } from './file-types.js';

export interface NewEvidence {
  controlCode: string;
  title: string;
  expiresOn: string | null;
  file: { originalname: string; buffer: Buffer };
}

const SELECT = {
  id: true,
  controlCode: true,
  title: true,
  fileName: true,
  mimeType: true,
  size: true,
  expiresOn: true,
  createdAt: true,
  uploadedBy: { select: { id: true, name: true } },
} as const;

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

@Injectable()
export class EvidenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: EvidenceStorage,
  ) {}

  /** The entity's current evidence, newest first, optionally for one control. */
  async list(auth: AuthContext, controlCode?: string) {
    const rows = await this.prisma.forEntity(auth.entityId).evidence.findMany({
      where: { removedAt: null, ...(controlCode && { controlCode }) },
      orderBy: { createdAt: 'desc' },
      select: SELECT,
    });
    return rows.map((r) => ({ ...r, expiresOn: day(r.expiresOn) }));
  }

  /** Counts for the rail card: current evidence, and how much has expired or expires within 30 days. */
  async summary(auth: AuthContext, now = new Date()) {
    const db = this.prisma.forEntity(auth.entityId);
    const today = riyadhToday(now);
    const soon = new Date(today.getTime() + EVIDENCE_SOON_DAYS * 86_400_000);
    const [total, expired, expiring] = await Promise.all([
      db.evidence.count({ where: { removedAt: null } }),
      db.evidence.count({ where: { removedAt: null, expiresOn: { lt: today } } }),
      db.evidence.count({ where: { removedAt: null, expiresOn: { gte: today, lte: soon } } }),
    ]);
    return { total, expired, expiring };
  }

  /** Admins can attach evidence to any control; a Control Owner to controls assigned to them. */
  private async assertCanAttach(auth: AuthContext, controlCode: string) {
    const control = await this.prisma.eccControl.findUnique({ where: { code: controlCode }, select: { parentCode: true } });
    if (!control || control.parentCode !== null) throw new NotFoundException({ code: 'not_found' });
    if (auth.role === 'ADMIN') return;
    const status = await this.prisma
      .forEntity(auth.entityId)
      .controlStatus.findUnique({ where: { entityId_controlCode: { entityId: auth.entityId, controlCode } }, select: { ownerId: true } });
    if (auth.role !== 'CONTROL_OWNER' || status?.ownerId !== auth.userId) throw new ForbiddenException({ code: 'forbidden' });
  }

  async upload(auth: AuthContext, input: NewEvidence, meta: RequestMeta) {
    await this.assertCanAttach(auth, input.controlCode);

    const fileName = cleanFileName(input.file.originalname);
    const mimeType = evidenceType(fileName, input.file.buffer);
    if (!mimeType) throw new AuthError('file_type', HttpStatus.UNPROCESSABLE_ENTITY);

    const id = randomUUID();
    const storageKey = `${auth.entityId}/${id}`;
    const sha256 = createHash('sha256').update(input.file.buffer).digest('hex');
    // Bytes first: a row never points at a missing file. If the insert fails,
    // an unreferenced file is left behind, which is harmless.
    await this.storage.put(storageKey, input.file.buffer);

    const db = this.prisma.forEntity(auth.entityId);
    const row = await db.evidence.create({
      data: {
        id,
        entityId: auth.entityId,
        controlCode: input.controlCode,
        title: input.title,
        fileName,
        mimeType,
        size: input.file.buffer.length,
        sha256,
        storageKey,
        expiresOn: input.expiresOn ? new Date(`${input.expiresOn}T00:00:00Z`) : null,
        uploadedById: auth.userId,
      },
      select: SELECT,
    });
    await db.auditLog.create({
      data: {
        entityId: auth.entityId,
        actorId: auth.userId,
        action: 'evidence.uploaded',
        target: input.controlCode,
        ip: meta.ip ?? null,
        meta: { evidenceId: id, title: input.title, fileName, size: row.size, sha256 },
      },
    });
    return { ...row, expiresOn: day(row.expiresOn) };
  }

  /** Every role in the entity may read evidence; each download is audited. */
  async open(auth: AuthContext, id: string, meta: RequestMeta) {
    const db = this.prisma.forEntity(auth.entityId);
    const row = await db.evidence.findFirst({ where: { id, removedAt: null } });
    if (!row) throw new NotFoundException({ code: 'not_found' });
    await db.auditLog.create({
      data: { entityId: auth.entityId, actorId: auth.userId, action: 'evidence.downloaded', target: row.controlCode, ip: meta.ip ?? null, meta: { evidenceId: id, title: row.title } },
    });
    return { row, stream: this.storage.open(row.storageKey) };
  }

  /** Admins, or whoever uploaded it. The file and row are kept; only removedAt is set. */
  async remove(auth: AuthContext, id: string, meta: RequestMeta) {
    const db = this.prisma.forEntity(auth.entityId);
    const row = await db.evidence.findFirst({ where: { id, removedAt: null } });
    if (!row) throw new NotFoundException({ code: 'not_found' });
    if (auth.role !== 'ADMIN' && row.uploadedById !== auth.userId) throw new ForbiddenException({ code: 'forbidden' });
    await db.evidence.update({ where: { id }, data: { removedAt: new Date(), removedById: auth.userId } });
    await db.auditLog.create({
      data: { entityId: auth.entityId, actorId: auth.userId, action: 'evidence.removed', target: row.controlCode, ip: meta.ip ?? null, meta: { evidenceId: id, title: row.title } },
    });
  }
}
