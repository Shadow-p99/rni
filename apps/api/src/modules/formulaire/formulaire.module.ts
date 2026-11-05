import { Module } from '@nestjs/common';
import { FormulaireConfigService } from './formulaire-config.service.js';
import { FormulaireController } from './formulaire.controller.js';
import { FormulaireService } from './formulaire.service.js';

@Module({ controllers: [FormulaireController], providers: [FormulaireService, FormulaireConfigService], exports: [FormulaireConfigService] })
export class FormulaireModule {}
