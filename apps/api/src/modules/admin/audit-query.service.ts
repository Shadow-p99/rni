import { Injectable, Logger } from '@nestjs/common';
import { addDays, isIsoDate, zonedMidnight, type AuditLineDto, type AuditPageDto, type AuditQuery } from '@rni/shared';
import { Op, type WhereOptions } from 'sequelize';
import { BusinessException } from '../../common/business.exception.js';
import { AdminLogSplunk } from '../../database/models/index.js';

const METHODES = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const iso = (d: Date | string) => new Date(d).toISOString();
const like = (s: string) => `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/**
 * Consultation de l'audit des requêtes (`t_admin_log_splunk`, alimentée pour l'export Talend →
 * Splunk) : filtres par utilisateur, route, statut, période… du plus récent au plus ancien.
 */
@Injectable()
export class AuditQueryService {
  private readonly logger = new Logger(AuditQueryService.name);

  async search(q: AuditQuery): Promise<AuditPageDto> {
    const limite = Math.min(Math.max(Number(q.limite) || 100, 1), 500);
    const where: WhereOptions[] = [];
    const nigend = q.nigend?.trim();
    if (nigend) where.push({ rio_user: nigend.slice(0, 8) });
    const route = q.route?.trim();
    if (route) where.push({ route: { [Op.iLike]: like(route.slice(0, 200)) } });
    const methode = q.methode?.trim().toUpperCase();
    if (methode) {
      if (!METHODES.includes(methode)) throw BusinessException.invalid('Méthode HTTP inconnue.');
      where.push({ methode });
    }
    const statut = q.statut?.trim();
    if (statut) {
      const family = /^([2-5])xx$/.exec(statut);
      if (family) {
        const base = Number(family[1]) * 100;
        where.push({ statut: { [Op.gte]: base, [Op.lt]: base + 100 } });
      } else if (statut === 'refus') where.push({ statut: { [Op.in]: [401, 403] } });
      else if (/^\d{3}$/.test(statut)) where.push({ statut: Number(statut) });
      else throw BusinessException.invalid('Statut : 2xx, 3xx, 4xx, 5xx, refus ou code à 3 chiffres.');
    }
    if (String(q.non_authentifie) === 'true') where.push({ authentifie: false });
    if (q.request_id?.trim()) where.push({ request_id: q.request_id.trim().slice(0, 128) });
    if (q.ip?.trim()) where.push({ ip: q.ip.trim().slice(0, 64) });
    if (q.du) {
      if (!isIsoDate(q.du)) throw BusinessException.invalid('Date de début invalide.');
      where.push({ horodatage: { [Op.gte]: zonedMidnight(q.du) } });
    }
    if (q.au) {
      if (!isIsoDate(q.au)) throw BusinessException.invalid('Date de fin invalide.');
      where.push({ horodatage: { [Op.lt]: zonedMidnight(addDays(q.au, 1)) } });
    }
    const avant = Number(q.avant);
    if (Number.isInteger(avant) && avant > 0) where.push({ id_log: { [Op.lt]: avant } });

    const rows = await AdminLogSplunk.findAll({ where: { [Op.and]: where }, order: [['id_log', 'DESC']], limit: limite + 1, raw: true });
    const more = rows.length > limite;
    const items: AuditLineDto[] = (more ? rows.slice(0, limite) : rows).map((r) => ({
      id_log: Number(r.id_log),
      horodatage: iso(r.horodatage),
      methode: r.methode,
      route: r.route,
      statut: r.statut,
      authentifie: r.authentifie,
      rio_user: r.rio_user,
      role: r.role,
      code_unite: r.code_unite,
      ip: r.ip,
      duree_ms: r.duree_ms,
      taille_reponse: r.taille_reponse,
      request_id: r.request_id,
      user_agent: r.user_agent,
      hote: r.hote,
      pid: r.pid,
    }));
    this.logger.debug(`Audit consulté : ${where.length} filtre(s), ${items.length} ligne(s)`);
    return { items, suivant: more ? items[items.length - 1].id_log : null };
  }
}
