import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import {
  Droit,
  type DroitsUpdateDto,
  type FormulaireConfigUpdateDto,
  type MessageDto,
  type ParamAppUpdateDto,
  type PositionInputDto,
  type ProfilCreateDto,
  type ProfilGestionUpdateDto,
  type ProfilInputDto,
} from '@rni/shared';
import { AdminLogService } from '../../common/admin-log.service.js';
import { CurrentUser, type RniUser } from '../../common/auth/current-user.js';
import { RequireDroit } from '../../common/auth/decorators.js';
import { FormulaireConfigService } from '../formulaire/formulaire-config.service.js';
import { ParametrageService } from './parametrage.service.js';

/**
 * Paramétrage de l'application (droit `admin.acces`) : droits par profil, profils, gestion du
 * personnel, positions de service, fiche de crise, paramètres applicatifs, messages.
 * Effet immédiat sur toutes les instances ; chaque modification est tracée (BR-SEC-3).
 */
@Controller('admin')
@RequireDroit(Droit.ADMIN_ACCES)
export class ParametrageController {
  constructor(
    private readonly service: ParametrageService,
    private readonly formulaire: FormulaireConfigService,
    private readonly adminLog: AdminLogService,
  ) {}

  @Get('droits')
  droits() {
    return this.service.droits();
  }

  @Put('droits')
  async updateDroits(@CurrentUser() user: RniUser, @Body() body: DroitsUpdateDto) {
    const { result, changes } = await this.service.updateDroits(body, user.nigend);
    this.adminLog.trace('admin.droits', user.nigend, { modifications: changes });
    return result;
  }

  @Get('profils')
  profils() {
    return this.service.profils();
  }

  @Post('profils')
  async createProfil(@CurrentUser() user: RniUser, @Body() body: ProfilCreateDto) {
    const result = await this.service.createProfil(body, user.nigend);
    this.adminLog.trace('admin.profil.create', user.nigend, { libelle: body.libelle, modele: body.modele ?? null });
    return result;
  }

  @Put('profils/gestion')
  async updateGestion(@CurrentUser() user: RniUser, @Body() body: ProfilGestionUpdateDto) {
    const { result, changes } = await this.service.updateGestion(body, user.nigend);
    this.adminLog.trace('admin.profil.gestion', user.nigend, { modifications: changes });
    return result;
  }

  @Put('profils/:id')
  async updateProfil(@CurrentUser() user: RniUser, @Param('id', ParseIntPipe) id: number, @Body() body: ProfilInputDto) {
    const result = await this.service.updateProfil(id, body, user.nigend);
    this.adminLog.trace('admin.profil.update', user.nigend, { id_profil: id, ...body });
    return result;
  }

  @Delete('profils/:id')
  async deleteProfil(@CurrentUser() user: RniUser, @Param('id', ParseIntPipe) id: number) {
    const result = await this.service.deleteProfil(id, user.nigend);
    this.adminLog.trace('admin.profil.delete', user.nigend, { id_profil: id });
    return result;
  }

  @Get('positions')
  positions() {
    return this.service.positions();
  }

  @Post('positions')
  async createPosition(@CurrentUser() user: RniUser, @Body() body: PositionInputDto) {
    const result = await this.service.createPosition(body, user.nigend);
    this.adminLog.trace('admin.position.create', user.nigend, { ...body });
    return result;
  }

  @Put('positions/:id')
  async updatePosition(@CurrentUser() user: RniUser, @Param('id', ParseIntPipe) id: number, @Body() body: PositionInputDto) {
    const result = await this.service.updatePosition(id, body, user.nigend);
    this.adminLog.trace('admin.position.update', user.nigend, { id_pos_service: id, ...body });
    return result;
  }

  @Get('formulaire')
  formulaireConfig() {
    return this.formulaire.config();
  }

  @Put('formulaire')
  async updateFormulaire(@CurrentUser() user: RniUser, @Body() body: FormulaireConfigUpdateDto) {
    const result = await this.formulaire.update(body, user.nigend);
    this.adminLog.trace('admin.formulaire', user.nigend, { crises: body.crises?.map((c) => c.libelle), sections: body.sections?.length ?? 0, champs: body.champs?.length ?? 0 });
    return result;
  }

  @Get('parametres')
  params() {
    return this.service.params();
  }

  @Put('parametres')
  async updateParam(@CurrentUser() user: RniUser, @Body() body: ParamAppUpdateDto) {
    const { result, secret, before } = await this.service.updateParam(body, user.nigend);
    // Valeur d'un secret jamais tracée
    this.adminLog.trace('admin.parametre', user.nigend, { cle: body.cle, ...(secret ? { secret: true } : { avant: before, apres: body.valeur?.trim() }) });
    return result;
  }

  @Get('messages')
  messagesList() {
    return this.service.messagesList();
  }

  @Put('messages')
  async updateMessage(@CurrentUser() user: RniUser, @Body() body: MessageDto) {
    const result = await this.service.updateMessage(body, user.nigend);
    this.adminLog.trace('admin.message', user.nigend, { code_message: body.code_message, type: body.type });
    return result;
  }
}
