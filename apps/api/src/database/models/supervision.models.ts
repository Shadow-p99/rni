import { AutoIncrement, Column, DataType, Model, PrimaryKey, Table } from 'sequelize-typescript';

/** Journal applicatif conservé en base (tableau de bord d'administration). */
@Table({ tableName: 't_app_logs', timestamps: false })
export class AppLog extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT)
  id_log: number;

  @Column(DataType.DATE)
  horodatage: Date;

  @Column(DataType.STRING(8))
  niveau: string;

  @Column(DataType.STRING(80))
  contexte: string | null;

  @Column(DataType.TEXT)
  message: string;

  @Column(DataType.TEXT)
  pile: string | null;

  @Column(DataType.STRING(128))
  request_id: string | null;

  @Column(DataType.STRING(8))
  nigend: string | null;

  @Column(DataType.INTEGER)
  pid: number | null;

  @Column(DataType.STRING(128))
  hote: string | null;
}

/** Métriques HTTP agrégées par minute, route et méthode. */
@Table({ tableName: 't_request_metrics', timestamps: false })
export class RequestMetric extends Model {
  @PrimaryKey
  @Column(DataType.DATE)
  minute: Date;

  @PrimaryKey
  @Column(DataType.STRING(256))
  route: string;

  @PrimaryKey
  @Column(DataType.STRING(8))
  methode: string;

  @Column(DataType.INTEGER)
  nb: number;

  @Column(DataType.INTEGER)
  nb_4xx: number;

  @Column(DataType.INTEGER)
  nb_5xx: number;

  @Column(DataType.INTEGER)
  nb_lentes: number;

  @Column(DataType.BIGINT)
  duree_totale_ms: number;

  @Column(DataType.INTEGER)
  duree_max_ms: number;

  @Column(DataType.INTEGER)
  nb_lt100: number;

  @Column(DataType.INTEGER)
  nb_lt300: number;

  @Column(DataType.INTEGER)
  nb_lt1000: number;

  @Column(DataType.INTEGER)
  nb_lt3000: number;
}

/** Dernière activité de chaque utilisateur. */
@Table({ tableName: 't_user_activity', timestamps: false })
export class UserActivity extends Model {
  @PrimaryKey
  @Column(DataType.STRING(8))
  nigend: string;

  @Column(DataType.DATE)
  derniere_activite: Date;

  @Column(DataType.STRING(256))
  derniere_route: string | null;

  @Column(DataType.DATEONLY)
  jour: string;

  @Column(DataType.INTEGER)
  nb_requetes_jour: number;
}
