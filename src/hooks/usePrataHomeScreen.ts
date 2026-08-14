import { useEffect } from 'react';

const JARVIS_MANIFEST = '/jarvis.webmanifest';

/**
 * iOS/Android "Add to Home Screen" uses the web manifest start_url,
 * not the current path. Point it at /prata while this screen is open.
 */
export function usePrataHomeScreen() {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = 'Jarvis';

    let manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    const created = !manifest;
    const prevHref = manifest?.getAttribute('href');
    if (!manifest) {
      manifest = document.createElement('link');
      manifest.rel = 'manifest';
      document.head.appendChild(manifest);
    }
    manifest.href = JARVIS_MANIFEST;

    let appleTitle = document.querySelector<HTMLMetaElement>(
      'meta[name="apple-mobile-web-app-title"]',
    );
    const createdApple = !appleTitle;
    const prevApple = appleTitle?.getAttribute('content');
    if (!appleTitle) {
      appleTitle = document.createElement('meta');
      appleTitle.name = 'apple-mobile-web-app-title';
      document.head.appendChild(appleTitle);
    }
    appleTitle.content = 'Jarvis';

    let capable = document.querySelector<HTMLMetaElement>(
      'meta[name="apple-mobile-web-app-capable"]',
    );
    if (!capable) {
      capable = document.createElement('meta');
      capable.name = 'apple-mobile-web-app-capable';
      capable.content = 'yes';
      document.head.appendChild(capable);
    }

    return () => {
      document.title = prevTitle;
      if (created) manifest?.remove();
      else if (prevHref) manifest!.href = prevHref;
      if (createdApple) appleTitle?.remove();
      else if (prevApple && appleTitle) appleTitle.content = prevApple;
    };
  }, []);
}
