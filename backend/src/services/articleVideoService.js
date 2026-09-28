const ALLOWED_VIDEO_HOSTS = new Set([
  'www.youtube.com',
  'youtube.com',
  'www.youtube-nocookie.com',
  'youtube-nocookie.com',
  'drive.google.com'
]);

function normalizeVideoUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return null;

  let url;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return null;
  }

  if (url.protocol !== 'https:') return null;
  const hostname = url.hostname.toLowerCase();
  if (!ALLOWED_VIDEO_HOSTS.has(hostname)) return null;

  const youtubeMatch = url.pathname.match(/^\/embed\/([A-Za-z0-9_-]{6,})\/?$/);
  if (youtubeMatch && (hostname.includes('youtube.com') || hostname.includes('youtube-nocookie.com'))) {
    return {
      provider: 'youtube',
      id: youtubeMatch[1],
      embedUrl: `https://www.youtube-nocookie.com/embed/${youtubeMatch[1]}`
    };
  }

  const driveMatch = url.pathname.match(/^\/file\/d\/([A-Za-z0-9_-]+)\/preview\/?$/);
  if (driveMatch && hostname === 'drive.google.com') {
    return {
      provider: 'drive',
      id: driveMatch[1],
      embedUrl: `https://drive.google.com/file/d/${driveMatch[1]}/preview`
    };
  }

  return null;
}

function validateArticleVideoEmbeds(content) {
  const html = String(content || '');
  const iframeTags = html.match(/<iframe\b[^>]*>/gi) || [];

  for (const tag of iframeTags) {
    const srcMatch = tag.match(/\bsrc\s*=\s*(["'])(.*?)\1/i);
    if (!srcMatch || !normalizeVideoUrl(srcMatch[2])) {
      return { error: 'O artigo possui um v\u00eddeo inv\u00e1lido. Use somente links do YouTube ou Google Drive.' };
    }
  }

  return { value: html };
}

module.exports = {
  normalizeVideoUrl,
  validateArticleVideoEmbeds
};
