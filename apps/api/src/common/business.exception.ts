import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode, RuleViolation } from '@rni/shared';

/**
 * Erreur métier : renvoyée en HTTP 400 (par défaut) avec le libellé de `t_admin_messages`
 * (BR-SEC-2). `details` précise le contexte (règle violée…).
 */
export class BusinessException extends HttpException {
  constructor(
    readonly code: ErrorCode | string,
    readonly details?: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
  ) {
    super({ code, details }, status);
  }

  static from(v: RuleViolation, status: HttpStatus = HttpStatus.BAD_REQUEST): BusinessException {
    return new BusinessException(v.code, v.message, status);
  }

  static forbidden(details?: string): BusinessException {
    return new BusinessException(ErrorCode.ACTION_NON_AUTORISEE, details, HttpStatus.FORBIDDEN);
  }

  static notFound(details?: string): BusinessException {
    return new BusinessException(ErrorCode.RESSOURCE_INTROUVABLE, details, HttpStatus.NOT_FOUND);
  }

  static unauthorized(details?: string): BusinessException {
    return new BusinessException(ErrorCode.NON_AUTHENTIFIE, details, HttpStatus.UNAUTHORIZED);
  }

  static missing(param: string): BusinessException {
    return new BusinessException(ErrorCode.PARAMETRE_MANQUANT, `Paramètre manquant : ${param}`);
  }

  static invalid(details: string): BusinessException {
    return new BusinessException(ErrorCode.PARAMETRE_INVALIDE, details);
  }
}
