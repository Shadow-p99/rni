import { Injectable } from '@nestjs/common';

/**
 * État du processus pour les sondes : `draining` dès le début d'un arrêt gracieux, afin que le
 * load-balancer / l'orchestrateur cesse d'envoyer du trafic avant la fermeture du serveur.
 */
@Injectable()
export class LifecycleService {
  readonly startedAt = new Date();
  private drainingSince: Date | null = null;

  get draining(): boolean {
    return this.drainingSince != null;
  }

  startDraining(): void {
    this.drainingSince ??= new Date();
  }
}
