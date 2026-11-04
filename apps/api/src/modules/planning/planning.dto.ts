import type { InsertPlanningDto, PlanningInputDto } from '@rni/shared';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, MaxLength, ValidateIf } from 'class-validator';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

abstract class PlageBody {
  @Matches(ISO, { message: 'date_debut invalide (AAAA-MM-JJ)' })
  date_debut: string;

  @Type(() => Number)
  @IsIn([1, 2], { message: 'id_creneaux_debut doit valoir 1 (Jour) ou 2 (Nuit)' })
  id_creneaux_debut: number;

  @Matches(ISO, { message: 'date_fin invalide (AAAA-MM-JJ)' })
  date_fin: string;

  @Type(() => Number)
  @IsIn([1, 2], { message: 'id_creneaux_fin doit valoir 1 (Jour) ou 2 (Nuit)' })
  id_creneaux_fin: number;

  @Type(() => Number)
  @IsInt()
  id_pos_service: number;

  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @IsString()
  @MaxLength(512)
  adresse_temp?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @Type(() => Number)
  @IsNumber()
  x_adresse_temp?: number | null;

  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @Type(() => Number)
  @IsNumber()
  y_adresse_temp?: number | null;
}

export class PlanningBody extends PlageBody implements PlanningInputDto {
  @IsString()
  @Matches(/^\d{5,8}$/, { message: 'nigend invalide' })
  nigend: string;

  /** Remplace les plannings existants sur la période (création uniquement). */
  @IsOptional()
  @IsBoolean()
  ecraser?: boolean;
}

/** En modification, le nigend est facultatif (il ne peut de toute façon pas changer). */
export class PlanningUpdateBody extends PlageBody implements Omit<PlanningInputDto, 'nigend'> {
  @IsOptional()
  @IsString()
  nigend?: string;
}

export class InsertPlanningBody extends PlanningUpdateBody implements Omit<InsertPlanningDto, 'nigend'> {
  @Type(() => Number)
  @IsInt()
  id_planning: number;
}

/** `GET /planning/overlaps` : période envisagée pour un agent. */
export class OverlapQuery {
  @Matches(/^\d{5,8}$/, { message: 'nigend invalide' })
  nigend: string;

  @Matches(ISO, { message: 'date_debut invalide (AAAA-MM-JJ)' })
  date_debut: string;

  @Type(() => Number)
  @IsIn([1, 2])
  id_creneaux_debut: number;

  @Matches(ISO, { message: 'date_fin invalide (AAAA-MM-JJ)' })
  date_fin: string;

  @Type(() => Number)
  @IsIn([1, 2])
  id_creneaux_fin: number;
}
