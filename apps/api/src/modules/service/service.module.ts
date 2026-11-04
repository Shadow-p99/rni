import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module.js';
import { ServiceController } from './service.controller.js';

@Module({ imports: [UsersModule], controllers: [ServiceController] })
export class ServiceModule {}
