import { ErrorCode } from '@rni/shared';
import { ProxyAgent, fetch as undiciFetch, type Dispatcher } from 'undici';
import { BusinessException } from '../../common/business.exception.js';

const agents = new Map<string, Dispatcher>();

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
  try {
    res = await undiciFetch(url, {
      headers: { Accept: 'application/json', ...opts.headers },
      dispatcher: dispatcherFor(opts.proxy),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
    });
  } catch (e) {
    throw new BusinessException(ErrorCode.SERVICE_EXTERNE, `${new URL(url).host} : ${(e as Error).message}`, 502);
  }
  if (!res.ok) throw new BusinessException(ErrorCode.SERVICE_EXTERNE, `${new URL(url).host} : HTTP ${res.status}`, 502);
  return (await res.json()) as T;
}

export function joinUrl(host: string, path: string): string {
  return `${host.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}
