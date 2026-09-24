import { Module } from '@nestjs/common';
import { EvidenceController } from './evidence.controller.js';
import { EvidenceService } from './evidence.service.js';
import { EvidenceStorage, LocalDiskStorage } from './storage.js';

@Module({
  controllers: [EvidenceController],
  providers: [EvidenceService, { provide: EvidenceStorage, useClass: LocalDiskStorage }],
})
export class EvidenceModule {}
