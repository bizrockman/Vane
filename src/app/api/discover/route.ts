import { searchTavilyNews } from '@/lib/tavily';

const websitesForTopic = {
  tech: {
    query: ['technology news', 'latest tech', 'AI', 'science and innovation'],
    links: ['techcrunch.com', 'wired.com', 'theverge.com'],
  },
  finance: {
    query: ['finance news', 'economy', 'stock market', 'investing'],
    links: ['bloomberg.com', 'cnbc.com', 'marketwatch.com'],
  },
  art: {
    query: ['art news', 'culture', 'modern art', 'cultural events'],
    links: ['artnews.com', 'hyperallergic.com', 'theartnewspaper.com'],
  },
  sports: {
    query: ['sports news', 'latest sports', 'cricket football tennis'],
    links: ['espn.com', 'bbc.com/sport', 'skysports.com'],
  },
  entertainment: {
    query: ['entertainment news', 'movies', 'TV shows', 'celebrities'],
    links: ['hollywoodreporter.com', 'variety.com', 'deadline.com'],
  },
};

type Topic = keyof typeof websitesForTopic;

export const GET = async (req: Request) => {
  try {
    const params = new URL(req.url).searchParams;

    const mode: 'normal' | 'preview' =
      (params.get('mode') as 'normal' | 'preview') || 'normal';
    const topic: Topic = (params.get('topic') as Topic) || 'tech';

    const selectedTopic = websitesForTopic[topic];

    let data = [];

    if (mode === 'normal') {
      const seenUrls = new Set();

      // Promise.allSettled so a single rate-limited (429) or failing call
      // doesn't take the whole panel down. We render whatever did come back.
      const settled = await Promise.allSettled(
        selectedTopic.links.flatMap((link) =>
          selectedTopic.query.map(async (query) => {
            return (
              await searchTavilyNews(query, {
                include_domains: [link],
                max_results: 6,
              })
            ).results;
          }),
        ),
      );
      const failures = settled.filter((s) => s.status === 'rejected').length;
      if (failures > 0) {
        console.warn(
          `Discover: ${failures}/${settled.length} sub-queries failed (likely rate limit); rendering partial results.`,
        );
      }
      data = settled
        .flatMap((s) => (s.status === 'fulfilled' ? s.value : []))
        .filter((item) => {
          const url = item.url?.toLowerCase().trim();
          if (seenUrls.has(url)) return false;
          seenUrls.add(url);
          return true;
        })
        .sort(() => Math.random() - 0.5);
    } else {
      const link = selectedTopic.links[
        Math.floor(Math.random() * selectedTopic.links.length)
      ];
      const query = selectedTopic.query[
        Math.floor(Math.random() * selectedTopic.query.length)
      ];
      data = (
        await searchTavilyNews(query, {
          include_domains: [link],
          max_results: 5,
        })
      ).results;
    }

    return Response.json(
      {
        blogs: data,
      },
      {
        status: 200,
      },
    );
  } catch (err) {
    console.error(`An error occurred in discover route: ${err}`);
    return Response.json(
      {
        message: 'An error has occurred',
      },
      {
        status: 500,
      },
    );
  }
};
