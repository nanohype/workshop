import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        disallow: ['/api/', '/workflows/', '/settings', '/library'],
        allow: ['/login'],
      },
    ],
  };
}
