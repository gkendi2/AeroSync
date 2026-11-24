import { ScrollViewStyleReset, useServerDocumentContext } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

/**
 * Web only: the HTML page around the app in the static web export
 * (`npx expo export --platform web`). It is not used by the iOS or Android app.
 *
 * Keeps Expo's default head tags and adds what makes the site installable
 * from the browser ("Add to Home Screen"): the web app manifest in public/
 * and the iOS home-screen tags. No service worker: the app needs a
 * connection to Firebase anyway.
 */
export default function Root({ children }: PropsWithChildren) {
  // Expo's own tags (scripts, styles, favicon) must be rendered here,
  // or the exported page would not load the app.
  const { htmlAttributes, bodyAttributes, headNodes, bodyNodes } = useServerDocumentContext();

  return (
    <html lang="en" {...htmlAttributes}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        {/* viewport-fit=cover: use the whole iPhone screen, including around the notch. */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />

        {/* Installable web app (Android / Chrome) */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#C8102E" />
        <meta name="mobile-web-app-capable" content="yes" />

        {/* iPhone "Add to Home Screen" (Safari) */}
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="AeroSync" />

        {/* Expo's default reset so the app fills the page and scrolls inside its own views. */}
        <ScrollViewStyleReset />
        {headNodes}
      </head>
      <body {...bodyAttributes}>
        {children}
        {bodyNodes}
      </body>
    </html>
  );
}
