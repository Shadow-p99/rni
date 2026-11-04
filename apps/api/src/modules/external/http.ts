import { Logger } from '@nestjs/common';
import { ErrorCode } from '@rni/shared';
import { ProxyAgent, fetch as undiciFetch, type Dispatcher } from 'undici';
import { BusinessException } from '../../common/business.exception.js';

const agents = new Map<string, Dispatcher>();
const logger = new Logger('ExternalHttp');

/** URL journalisable : jetons et paramètres masqués (le jeton Facade passe dans l'URL). */
export function safeUrl(url: string): string {
  try {
    const u = new URL(url);
    for (const k of [...u.searchParams.keys()]) u.searchParams.set(k, /token|key|secret|password/i.test(k) ? '***' : '…');
    return `${u.origin}${u.pathname}${u.search ? decodeURIComponent(u.search) : ''}`;
  } catch {
    return '(URL invalide)';
  }
}

function dispatcherFor(proxy?: string | null): Dispatcher | undefined {
  if (!proxy) return undefined;
  let a = agents.get(proxy);
  if (!a) agents.set(proxy, (a = new ProxyAgent(proxy)));
  return a;
}

/**
 * Appel HTTPS sortant (CA interne via NODE_EXTRA_CA_CERTS, proxy optionnel) avec délai maximal.
 */
export async function getJson<T>(url: string, opts: { headers?: Record<string, string>; proxy?: string | null; timeoutMs?: number } = {}): Promise<T> {
  let res;
  const t0 = Date.now();
  const target = safeUrl(url);
  logger.verbose(`→ GET ${target}${opts.proxy ? ' (via proxy)' : ''}`);
  try {
    res = await undiciFetch(url, {
      headers: { Accept: 'application/json', ...opts.headers },
      dispatcher: dispatcherFor(opts.proxy),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
    });
  } catch (e) {
    const err = e as Error & { cause?: { code?: string } };
    logger.warn(`✗ GET ${target} : ${err.name === 'TimeoutError' ? 'délai dépassé' : err.message}${err.cause?.code ? ` (${err.cause.code})` : ''} après ${Date.now() - t0} ms`);
    throw new BusinessException(ErrorCode.SERVICE_EXTERNE, `${new URL(url).host} : ${err.message}`, 502);
  }
  if (!res.ok) {
    logger.warn(`✗ GET ${target} : HTTP ${res.status} en ${Date.now() - t0} ms`);
    throw new BusinessException(ErrorCode.SERVICE_EXTERNE, `${new URL(url).host} : HTTP ${res.status}`, 502);
  }
  try {
    const body = (await res.json()) as T;
    logger.debug(`✓ GET ${target} : HTTP ${res.status} en ${Date.now() - t0} ms`);
    return body;
  } catch (e) {
    logger.warn(`✗ GET ${target} : réponse JSON illisible (${(e as Error).message})`);
    throw new BusinessException(ErrorCode.SERVICE_EXTERNE, `${new URL(url).host} : réponse illisible`, 502);
  }
}

export function joinUrl(host: string, path: string): string {
  return `${host.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}
