import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller.js';
import { DashboardService } from './dashboard.service.js';

@Module({ controllers: [AdminController], providers: [DashboardService] })
export class AdminModule {}
