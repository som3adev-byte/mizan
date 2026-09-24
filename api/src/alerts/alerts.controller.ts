import { Controller, Get } from '@nestjs/common';
import { Auth } from '../auth/guards.js';
import type { AuthContext } from '../auth/auth.types.js';
import { AlertsService } from './alerts.service.js';

@Controller('alerts')
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @Get()
  async list(@Auth() auth: AuthContext) {
    const alerts = await this.alerts.list(auth);
    return { alerts, high: alerts.filter((a) => a.severity === 'high').length };
  }
}
