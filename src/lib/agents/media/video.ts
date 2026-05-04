import formatChatHistoryAsString from '@/lib/utils/formatHistory';
import { searchTavilyVideos } from '@/lib/tavily';
import {
  videoSearchFewShots,
  videoSearchPrompt,
} from '@/lib/prompts/media/videos';
import { ChatTurnMessage } from '@/lib/types';
import BaseLLM from '@/lib/models/base/llm';
import z from 'zod';

type VideoSearchChainInput = {
  chatHistory: ChatTurnMessage[];
  query: string;
};

type VideoSearchResult = {
  img_src: string;
  url: string;
  title: string;
  iframe_src: string;
};

const searchVideos = async (
  input: VideoSearchChainInput,
  llm: BaseLLM<any>,
) => {
  const schema = z.object({
    query: z.string().describe('The video search query.'),
  });

  const res = await llm.generateObject<typeof schema>({
    messages: [
      {
        role: 'system',
        content: videoSearchPrompt,
      },
      ...videoSearchFewShots,
      {
        role: 'user',
        content: `<conversation>\n${formatChatHistoryAsString(input.chatHistory)}\n</conversation>\n<follow_up>\n${input.query}\n</follow_up>`,
      },
    ],
    schema: schema,
  });

  const searchRes = await searchTavilyVideos(res.query, { max_results: 10 });

  const videos: VideoSearchResult[] = [];

  searchRes.results.forEach((result) => {
    if (result.img_src && result.url && result.title && result.iframe_src) {
      videos.push({
        img_src: result.img_src,
        url: result.url,
        title: result.title,
        iframe_src: result.iframe_src,
      });
    }
  });

  return videos.slice(0, 10);
};

export default searchVideos;
