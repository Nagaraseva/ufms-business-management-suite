import { Global, Module } from '@nestjs/common';
import { QueueService } from './queue.service';
import { QueueController } from './queue.controller';
import { WorkerHandlersService } from './worker-handlers.service';

@Global()
@Module({
  providers: [QueueService, WorkerHandlersService],
  controllers: [QueueController],
  exports: [QueueService],
})
export class QueueModule {}
