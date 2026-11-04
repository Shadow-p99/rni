import { Module } from '@nestjs/common';
import { PlanningModule } from '../planning/planning.module.js';
import { RegionController } from './region.controller.js';

@Module({ imports: [PlanningModule], controllers: [RegionController] })
export class RegionModule {}
