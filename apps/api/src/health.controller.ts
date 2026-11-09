import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from './common/decorators';
import { PrismaService } from './database/prisma.service';

@ApiTags('health')
@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get('health')
  health() {
    return { status: 'ok', service: 'ufms-api', version: '0.2.0', ts: new Date().toISOString() };
  }

  /** Readiness: confirms the database is actually reachable. */
  @Public()
  @Get('ready')
  async ready() {
    try {
      await this.prisma.$queryRawUnsafe('SELECT 1');
      return { status: 'ready', database: 'up' };
    } catch (e) {
      return { status: 'not-ready', database: 'down' };
    }
  }
}
