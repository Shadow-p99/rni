import { Module } from '@nestjs/common';
import { FormulaireModule } from '../formulaire/formulaire.module.js';
import { AdminController } from './admin.controller.js';
import { DashboardService } from './dashboard.service.js';
import { ParametrageController } from './parametrage.controller.js';
import { ParametrageService } from './parametrage.service.js';

@Module({ imports: [FormulaireModule], controllers: [AdminController, ParametrageController], providers: [DashboardService, ParametrageService] })
export class AdminModule {}
