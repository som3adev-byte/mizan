import { Controller, Get } from '@nestjs/common';
import { Public } from './auth/guards.js';

@Controller()
export class AppController {
  /** Liveness check for local runs and deployment probes. */
  @Public()
  @Get('health')
  health() {
    return { ok: true };
  }
}
