import { Module } from '@nestjs/common';
import { PlanningController } from './planning.controller.js';
import { PlanningRepository } from './planning.repository.js';
import { PlanningService } from './planning.service.js';

@Module({
  controllers: [PlanningController],
  providers: [PlanningService, PlanningRepository],
  exports: [PlanningService, PlanningRepository],
})
export class PlanningModule {}
