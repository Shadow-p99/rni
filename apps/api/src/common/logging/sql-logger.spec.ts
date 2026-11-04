import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { currentLogSettings } from './log-settings.service.js';
import { sqlLogging } from './sql-logger.js';

describe('journal SQL', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Object.assign(currentLogSettings, { sql: false, slowMs: 1000 });
  });

  it('requête lente : toujours signalée (warn) ; sinon rien tant que rni.log.sql est inactif', () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const debug = vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    sqlLogging('Executed (default): SELECT 1', 3);
    expect(debug).not.toHaveBeenCalled();
    sqlLogging('Executed (default): SELECT   *\n FROM planning', 1500);
    expect(warn).toHaveBeenCalledWith('Requête lente (1500 ms) : SELECT * FROM planning');
  });

  it('rni.log.sql actif : chaque requête en debug avec sa durée', () => {
    const debug = vi.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    currentLogSettings.sql = true;
    sqlLogging('Executed (default): SELECT 1', 4);
    expect(debug).toHaveBeenCalledWith('4 ms SELECT 1');
  });
});
