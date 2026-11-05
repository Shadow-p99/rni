import { AutoIncrement, Column, DataType, Model, PrimaryKey, Table } from 'sequelize-typescript';

@Table({ tableName: 't_param_app', timestamps: false })
export class ParamApp extends Model {
  @PrimaryKey
  @Column(DataType.STRING(128))
  cle_param_app: string;

  @Column(DataType.TEXT)
  valeur: string | null;

  @Column(DataType.STRING(512))
  description: string | null;

  @Column(DataType.BOOLEAN)
  is_front: boolean;
}

@Table({ tableName: 't_admin_messages', timestamps: false })
export class AdminMessage extends Model {
  @PrimaryKey
  @Column(DataType.STRING(16))
  code_message: string;

  @Column(DataType.STRING(512))
  libelle: string;

  @Column(DataType.STRING(16))
  type: string;
}

@Table({ tableName: 't_admin_logs', timestamps: false })
export class AdminLog extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT)
  id_log: number;

  @Column(DataType.DATE)
  horodatage: Date;

  @Column(DataType.STRING(16))
  code_message: string | null;

  @Column(DataType.STRING(8))
  nigend: string | null;

  @Column(DataType.STRING(8))
  methode: string | null;

  @Column(DataType.STRING(1024))
  url: string | null;

  @Column(DataType.TEXT)
  body: string | null;

  @Column(DataType.STRING(4000))
  description: string | null;
}

@Table({ tableName: 't_admin_log_splunk', timestamps: false })
export class AdminLogSplunk extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.BIGINT)
  id_log: number;

  @Column(DataType.DATE)
  horodatage: Date;

  @Column(DataType.STRING(64))
  ip: string | null;

  @Column(DataType.STRING(1024))
  route: string;

  @Column(DataType.STRING(8))
  methode: string;

  @Column(DataType.INTEGER)
  statut: number | null;

  @Column(DataType.STRING(8))
  rio_user: string | null;

  @Column(DataType.STRING(10))
  code_unite: string | null;

  @Column(DataType.STRING(64))
  role: string | null;

  @Column(DataType.STRING(8))
  institution: string;

  /** false : requête refusée avant authentification (nigend inconnu, hors reverse-proxy). */
  @Column(DataType.BOOLEAN)
  authentifie: boolean | null;

  @Column(DataType.INTEGER)
  duree_ms: number | null;

  @Column(DataType.INTEGER)
  taille_reponse: number | null;

  @Column(DataType.STRING(128))
  request_id: string | null;

  @Column(DataType.STRING(256))
  user_agent: string | null;

  @Column(DataType.STRING(128))
  hote: string | null;

  @Column(DataType.INTEGER)
  pid: number | null;
}
