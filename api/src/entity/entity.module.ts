import { Module } from '@nestjs/common';
import { EntityController } from './entity.controller.js';
import { EntityService } from './entity.service.js';

@Module({ controllers: [EntityController], providers: [EntityService] })
export class EntityModule {}
