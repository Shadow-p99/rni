import { Module } from '@nestjs/common';
import { FormulaireController } from './formulaire.controller.js';
import { FormulaireService } from './formulaire.service.js';

@Module({ controllers: [FormulaireController], providers: [FormulaireService] })
export class FormulaireModule {}
