import { useEffect, useState } from 'react';

/** Enrutador mínimo basado en el hash: #/modulo/parametro */
export function parseHash(hash: string): { path: string; segments: string[] } {
  const clean = hash.replace(/^#\/?/, '').replace(/\/+$/, '');
  const segments = clean ? clean.split('/').map(decodeURIComponent) : [];
  return { path: segments[0] ?? 'dashboard', segments };
}

export function useRoute() {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const on = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export function navigate(to: string) {
  const target = '#/' + to.replace(/^#?\/?/, '');
  if (window.location.hash !== target) window.location.hash = target;
}

export function href(to: string) {
  return '#/' + to.replace(/^\/?/, '');
}
