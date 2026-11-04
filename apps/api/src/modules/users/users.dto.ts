import type { CreateUserDto, UpdateUserDto } from '@rni/shared';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, MaxLength, ValidateIf } from 'class-validator';

export class CreateUserBody implements CreateUserDto {
  @Matches(/^\d{5,8}$/, { message: 'nigend invalide' })
  nigend: string;

  @Type(() => Number)
  @IsInt()
  @IsIn([1, 2, 3, 4, 5, 6, 7])
  id_profil: number;
}

export class UpdateUserBody implements UpdateUserDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([1, 2, 3, 4, 5, 6, 7])
  id_profil?: number;

  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @IsString()
  @MaxLength(32)
  tel_perso?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @IsString()
  @MaxLength(2000)
  commentaire?: string | null;
}

export class InfoDeviceBody {
  @IsOptional()
  @ValidateIf((_, v) => v != null)
  @IsString()
  @MaxLength(64)
  geoloc_id_geoloc: string | null;
}

export class ActivateLocationBody {
  @IsBoolean()
  isIndispo: boolean;

  @IsBoolean()
  value: boolean;
}
