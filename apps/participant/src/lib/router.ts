import { useEffect, useState } from 'react';

export type Route =
  | { name: 'join' }
  | { name: 'session'; code: string }
  | { name: 'privacy' }
  | { name: 'dashboard' }
  | { name: 'notFound' };

export function parseRoute(pathname: string): Route {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/') return { name: 'join' };
  if (path === '/datenschutz' || path === '/privacy') return { name: 'privacy' };
  if (path === '/dashboard') return { name: 'dashboard' };
  const code = /^\/(\d{6})$/.exec(path)?.[1];
  if (code) return { name: 'session', code };
  return { name: 'notFound' };
}

export function navigate(path: string, replace = false): void {
  if (replace) window.history.replaceState(null, '', path);
  else window.history.pushState(null, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(window.location.pathname));
  useEffect(() => {
    const onPop = (): void => {
      setRoute(parseRoute(window.location.pathname));
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
    };
  }, []);
  return route;
}
