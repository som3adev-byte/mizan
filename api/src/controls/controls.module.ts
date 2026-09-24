import { Module } from '@nestjs/common';
import { ControlsController } from './controls.controller.js';
import { ControlsService } from './controls.service.js';

@Module({ controllers: [ControlsController], providers: [ControlsService] })
export class ControlsModule {}
