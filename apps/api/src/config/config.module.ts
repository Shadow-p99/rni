import { availableParallelism } from 'node:os';
import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, loadConfig } from './configuration.js';

@Global()
@Module({
  providers: [{ provide: APP_CONFIG, useFactory: () => loadConfig(process.env, availableParallelism()) }],
  exports: [APP_CONFIG],
})
export class ConfigModule {}
