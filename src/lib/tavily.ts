import { getTavilyAPIKey, getTavilyBaseURL } from './config/serverRegistry';

/**
 * Search options accepted by `searchTavily`.
 *
 * The shape is kept compatible with upstream's old `SearxngSearchOptions`
 * (engines/categories/language/pageno) so callers in baseSearch.ts and the
 * topical search actions need minimal changes. The values are translated to
 * the Tavily-shape body that orio-search expects:
 *
 *   - `engines: ['reddit']` → `include_domains: ['reddit.com']`
 *   - `engines: ['arxiv', 'google scholar', 'pubmed']`
 *       → `include_domains: ['arxiv.org', 'scholar.google.com', 'pubmed.ncbi.nlm.nih.gov']`
 *   - `categories: ['news']` → `topic: 'news'`
 *
 * Anything else is dropped silently — Tavily-shape doesn't model engine
 * routing the way SearXNG does.
 */
export interface SearxngSearchOptions {
  categories?: string[];
  engines?: string[];
  language?: string;
  pageno?: number;
}

export interface SearxngSearchResult {
  title: string;
  url: string;
  img_src?: string;
  thumbnail_src?: string;
  thumbnail?: string;
  content?: string;
  author?: string;
  iframe_src?: string;
}

const ENGINE_TO_DOMAIN: Record<string, string> = {
  reddit: 'reddit.com',
  arxiv: 'arxiv.org',
  'google scholar': 'scholar.google.com',
  pubmed: 'pubmed.ncbi.nlm.nih.gov',
};

const translateOptions = (
  opts?: SearxngSearchOptions,
): {
  topic: 'general' | 'news';
  include_domains: string[];
} => {
  const include_domains: string[] = [];
  if (opts?.engines) {
    for (const engine of opts.engines) {
      const domain = ENGINE_TO_DOMAIN[engine.toLowerCase()];
      if (domain) include_domains.push(domain);
    }
  }
  const isNews = opts?.categories?.some((c) => c.toLowerCase() === 'news');
  return { topic: isNews ? 'news' : 'general', include_domains };
};

interface TavilyApiResult {
  title: string;
  url: string;
  content?: string;
  score?: number;
  raw_content?: string;
  thumbnail?: string;
}

interface TavilyApiResponse {
  query: string;
  answer?: string | null;
  results?: TavilyApiResult[];
  images?: Array<{ url: string; description?: string }>;
  response_time?: number;
}

export const searchTavily = async (
  query: string,
  opts?: SearxngSearchOptions,
): Promise<{
  results: SearxngSearchResult[];
  suggestions: string[];
}> => {
  const apiKey = getTavilyAPIKey();
  if (!apiKey) {
    throw new Error(
      'Tavily API key is not configured. Set TAVILY_API_KEY (Bearer key issued by orio-search).',
    );
  }

  const baseURL = getTavilyBaseURL().replace(/\/+$/, '');
  const { topic, include_domains } = translateOptions(opts);

  const body: Record<string, unknown> = {
    query,
    max_results: 10,
    search_depth: 'basic',
    topic,
  };
  if (include_domains.length > 0) body.include_domains = include_domains;

  const res = await fetch(`${baseURL}/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `Tavily search failed: ${res.status} ${res.statusText} ${text}`.trim(),
    );
  }

  const response = (await res.json()) as TavilyApiResponse;

  const results: SearxngSearchResult[] = (response.results || []).map((r) => ({
    title: r.title,
    url: r.url,
    content: r.content,
    thumbnail: r.thumbnail,
  }));

  return { results, suggestions: [] };
};

// Backwards-compatible alias so unmodified callers (baseSearch.ts etc.) keep
// working with a minimal diff. There is no SearXNG anymore — every call lands
// on the orio-search Tavily endpoint.
export const searchSearxng = searchTavily;


// ---------------------------------------------------------------------------
// Dedicated wrappers for orio-search's typed media/news endpoints.
// ---------------------------------------------------------------------------

const orioPost = async <T>(path: string, body: unknown): Promise<T> => {
  const apiKey = getTavilyAPIKey();
  if (!apiKey) {
    throw new Error(
      'Tavily API key is not configured. Set TAVILY_API_KEY (Bearer key issued by orio-search).',
    );
  }
  const baseURL = getTavilyBaseURL().replace(/\/+$/, '');
  const res = await fetch(`${baseURL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`orio ${path} failed: ${res.status} ${res.statusText} ${text}`.trim());
  }
  return (await res.json()) as T;
};

/**
 * News search via orio-search /search/news. Forces topic=news server-side and
 * surfaces per-result `thumbnail` when the underlying SearXNG news engine
 * supplies one.
 */
export const searchTavilyNews = async (
  query: string,
  opts?: { max_results?: number; include_domains?: string[] },
): Promise<{ results: SearxngSearchResult[] }> => {
  const body: Record<string, unknown> = {
    query,
    max_results: opts?.max_results ?? 10,
    search_depth: 'basic',
  };
  if (opts?.include_domains?.length) body.include_domains = opts.include_domains;
  const response = await orioPost<TavilyApiResponse>('/search/news', body);
  const results: SearxngSearchResult[] = (response.results || []).map((r) => ({
    title: r.title,
    url: r.url,
    content: r.content,
    thumbnail: r.thumbnail,
  }));
  return { results };
};

interface OrioImageHit {
  title: string;
  url: string;
  img_src: string;
  thumbnail_src?: string;
  source?: string;
}

interface OrioImageResponse {
  query: string;
  results: OrioImageHit[];
  response_time: number;
}

/** Image search via orio-search /search/images. Returns rich per-result fields. */
export const searchTavilyImages = async (
  query: string,
  opts?: { max_results?: number },
): Promise<{ results: OrioImageHit[] }> => {
  const response = await orioPost<OrioImageResponse>('/search/images', {
    query,
    max_results: opts?.max_results ?? 10,
  });
  return { results: response.results || [] };
};

interface OrioVideoHit {
  title: string;
  url: string;
  iframe_src?: string;
  img_src?: string;
  duration?: string;
  author?: string;
  source?: string;
}

interface OrioVideoResponse {
  query: string;
  results: OrioVideoHit[];
  response_time: number;
}

/** Video search via orio-search /search/videos. */
export const searchTavilyVideos = async (
  query: string,
  opts?: { max_results?: number },
): Promise<{ results: OrioVideoHit[] }> => {
  const response = await orioPost<OrioVideoResponse>('/search/videos', {
    query,
    max_results: opts?.max_results ?? 10,
  });
  return { results: response.results || [] };
};
