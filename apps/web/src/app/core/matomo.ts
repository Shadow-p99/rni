/** Mesure d'audience Matomo (`_paq`), activée si `rni.matomo.url` est paramétré. */
type Paq = unknown[][];

export function initMatomo(url: string | null, siteId: string | null): void {
  if (!url || !siteId || typeof window === 'undefined') return;
  const w = window as unknown as { _paq?: Paq };
  const paq = (w._paq = w._paq ?? []);
  paq.push(['enableLinkTracking']);
  const base = url.endsWith('/') ? url : `${url}/`;
  paq.push(['setTrackerUrl', `${base}matomo.php`]);
  paq.push(['setSiteId', siteId]);
  const s = document.createElement('script');
  s.async = true;
  s.src = `${base}matomo.js`;
  document.head.appendChild(s);
}

export function trackPage(path: string, title: string): void {
  const paq = (window as unknown as { _paq?: Paq })._paq;
  if (!paq) return;
  paq.push(['setCustomUrl', path]);
  paq.push(['setDocumentTitle', title]);
  paq.push(['trackPageView']);
}
