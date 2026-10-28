import {createParser} from 'eventsource-parser';
import {z} from 'zod';
import {parseDocument} from './config.mjs';

const wordSchema = z.object({
  text: z.string(),
  begin_index: z.number().int().nonnegative(),
  end_index: z.number().int().nonnegative(),
  begin_time: z.number().int().nonnegative(),
  end_time: z.number().int().nonnegative(),
}).refine(word => word.end_index >= word.begin_index && word.end_time >= word.begin_time);

const eventSchema = z.object({
  request_id: z.string().optional(),
  code: z.string().optional(),
  output: z.object({
    finish_reason: z.string().nullable().optional(),
    type: z.string().optional(),
    original_text: z.string().optional(),
    sentence: z.object({
      index: z.number().int().nonnegative(),
      words: z.array(wordSchema),
    }).optional(),
    audio: z.object({
      data: z.string().optional(),
      url: z.string().optional(),
    }).optional(),
  }).optional(),
  usage: z.record(z.string(), z.number()).optional(),
});

export const synthesisSchema = z.strictObject({
  requestId: z.string().nullable(),
  usage: z.record(z.string(), z.number()).nullable(),
  sentences: z.array(z.strictObject({
    index: z.number().int().nonnegative(),
    originalText: z.string().nullable(),
    words: z.array(wordSchema),
  })).min(1),
});

/**
 * Provider protocol only. Callers own caching, files, media inspection and logs.
 * A request is never retried automatically.
 */
export async function synthesize({text, config, credentials, recordEvent}) {
  const url = config.endpointTemplate.replace('{workspaceId}', credentials.workspaceId);
  const signal = AbortSignal.timeout(config.timeoutMs);
  const response = await fetch(url, {
    method: 'POST',
    signal,
    headers: {
      Authorization: 'Bearer ' + credentials.apiKey,
      'Content-Type': 'application/json',
      'X-DashScope-SSE': 'enable',
    },
    body: JSON.stringify({
      model: config.model,
      input: {text, voice: config.voice, ...config.input},
    }),
  });
  if (!response.ok) {
    recordEvent({httpStatus: response.status, body: await response.text()});
    throw new Error('阿里云 TTS 返回 HTTP ' + response.status + '；详细响应已保存在私有缓存。');
  }
  if (!response.headers.get('content-type')?.includes('text/event-stream') || !response.body) {
    recordEvent({httpStatus: response.status, body: await response.text()});
    throw new Error('阿里云未返回预期的 SSE 语音流；详细响应已保存在私有缓存。');
  }

  const audioChunks = [];
  const sentences = new Map();
  let requestId = null;
  let usage = null;
  let audioUrl;
  let completed = false;
  const parser = createParser({
    onError() {
      throw new Error('阿里云 SSE 响应格式无效。');
    },
    onEvent(event) {
      recordEvent(event);
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        throw new Error('阿里云 SSE 事件包含无效 JSON。');
      }
      const payload = parseDocument(eventSchema, data, '阿里云响应');
      requestId = payload.request_id ?? requestId;
      usage = payload.usage ?? usage;
      if (payload.code) throw new Error('阿里云 TTS 返回服务错误；详细响应已保存在私有缓存。');
      const output = payload.output;
      if (!output) throw new Error('阿里云 TTS 响应缺少 output。');
      if (output.audio?.data) audioChunks.push(Buffer.from(output.audio.data, 'base64'));
      if (output.audio?.url) audioUrl = output.audio.url;
      if (output.finish_reason === 'stop') completed = true;
      if (output.sentence) {
        const index = output.sentence.index;
        const sentence = sentences.get(index) ?? {index, originalText: null, words: [], completed: false};
        sentence.originalText = output.original_text ?? sentence.originalText;
        if (output.type === 'sentence-end') {
          sentence.words = output.sentence.words;
          sentence.completed = true;
        }
        sentences.set(index, sentence);
      }
    },
  });

  const decoder = new TextDecoder();
  for await (const chunk of response.body) {
    parser.feed(decoder.decode(chunk, {stream: true}));
  }
  parser.feed(decoder.decode());
  parser.reset({consume: true});
  if (!completed) throw new Error('语音流没有正常完成；不会自动发起第二次请求。');
  if ([...sentences.values()].some(sentence => !sentence.completed || !sentence.words.length)) {
    throw new Error('服务返回了未完成的句子或缺少真实字级时间戳。');
  }

  const timing = [...sentences.values()]
    .sort((a, b) => a.index - b.index)
    .map(sentence => ({
      index: sentence.index,
      originalText: sentence.originalText,
      words: sentence.words,
    }));
  if (!timing.some(sentence => sentence.words.length > 0)) {
    throw new Error('服务未返回真实字级时间戳；不会估算时间或自动改换音色。');
  }

  let audio;
  if (audioUrl) {
    // The signed audio URL is used as returned by Aliyun; never send API credentials to it.
    const download = await fetch(audioUrl, {signal});
    if (!download.ok) throw new Error('音频下载失败，HTTP ' + download.status + '。');
    audio = Buffer.from(await download.arrayBuffer());
  } else {
    audio = Buffer.concat(audioChunks);
  }
  if (!audio.length) throw new Error('阿里云没有返回音频数据。');
  return {
    audio,
    synthesis: parseDocument(synthesisSchema, {requestId, usage, sentences: timing}, '语音合成结果'),
  };
}
