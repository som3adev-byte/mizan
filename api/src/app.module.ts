import { Module } from '@nestjs/common';
import { AlertsModule } from './alerts/alerts.module.js';
import { AppController } from './app.controller.js';
import { AuditLogModule } from './audit-log/audit-log.module.js';
import { AuthModule } from './auth/auth.module.js';
import { ControlsModule } from './controls/controls.module.js';
import { EntityModule } from './entity/entity.module.js';
import { EvidenceModule } from './evidence/evidence.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { TasksModule } from './tasks/tasks.module.js';
import { UsersModule } from './users/users.module.js';
import { VisitsModule } from './visits/visits.module.js';

@Module({
  imports: [PrismaModule, AuthModule, UsersModule, ControlsModule, AuditLogModule, EvidenceModule, TasksModule, AlertsModule, EntityModule, VisitsModule],
  controllers: [AppController],
})
export class AppModule {}
