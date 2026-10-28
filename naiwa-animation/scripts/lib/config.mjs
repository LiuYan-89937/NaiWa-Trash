import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {z} from 'zod';

export const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
export const cacheRoot = path.join(projectRoot, 'generated', 'tts');
export const publicNarrationRoot = path.join(projectRoot, 'public', 'narration');
export const identifierSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]*$/);

const inputSchema = z.strictObject({
  format: z.literal('wav'),
  word_timestamp_enabled: z.literal(true),
  sample_rate: z.number().int().positive().optional(),
  volume: z.number().int().min(0).max(100).optional(),
  rate: z.number().min(0.5).max(2).optional(),
  pitch: z.number().min(0.5).max(2).optional(),
  seed: z.number().int().min(0).max(65535).optional(),
});

export const ttsConfigSchema = z.strictObject({
  provider: z.literal('aliyun-qwen-audio'),
  model: z.string().min(1),
  voice: z.string().min(1),
  endpointTemplate: z.string().refine(
    value => value.startsWith('https://') && value.includes('{workspaceId}'),
  ),
  input: inputSchema,
  timeoutMs: z.number().int().positive(),
  tools: z.strictObject({
    ffmpeg: z.string().min(1),
    ffprobe: z.string().min(1),
    audioCodec: z.string().min(1),
  }),
});

export const narrationSchema = z.strictObject({
  schemaVersion: z.literal(1),
  episodeId: identifierSchema,
  segments: z.array(z.strictObject({
    id: identifierSchema,
    text: z.string().refine(value => value.trim().length > 0),
    pauseAfterSeconds: z.number().finite().nonnegative().optional(),
  })).min(1).refine(segments => new Set(segments.map(s => s.id)).size === segments.length),
  tts: z.strictObject({
    model: z.string().min(1).optional(),
    voice: z.string().min(1).optional(),
    input: inputSchema.partial().optional(),
  }).optional(),
});

const credentialsSchema = z.strictObject({
  apiKey: z.string().min(1),
  workspaceId: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9-]*$/),
});

export function parseDocument(schema, document, label) {
  const result = schema.safeParse(document);
  if (!result.success) {
    const fields = [...new Set(result.error.issues.map(issue => issue.path.join('.') || '(root)'))];
    throw new Error(label + ' 字段无效：' + fields.join(', ') + '。');
  }
  return result.data;
}

export async function readJson(file) {
  let source;
  try {
    source = await readFile(file, 'utf8');
  } catch (error) {
    throw new Error('无法读取文件：' + file + '（' + error.code + '）。');
  }
  try {
    return JSON.parse(source);
  } catch {
    throw new Error('JSON 语法无效：' + file + '。');
  }
}

export async function loadTtsConfig(narration) {
  const base = parseDocument(
    ttsConfigSchema,
    await readJson(path.join(projectRoot, 'config', 'tts.json')),
    'TTS 配置',
  );
  const override = narration.tts ?? {};
  return parseDocument(ttsConfigSchema, {
    ...base,
    ...override,
    input: {...base.input, ...override.input},
  }, '本期 TTS 配置');
}

export async function loadCredentials() {
  const file = process.env.ALIYUN_CREDENTIALS_FILE;
  if (file) {
    return parseDocument(
      credentialsSchema,
      await readJson(path.resolve(projectRoot, file)),
      '阿里云凭证',
    );
  }
  const {DASHSCOPE_API_KEY: apiKey, SFM_WORKSPACE_ID: workspaceId} = process.env;
  return parseDocument(credentialsSchema, {apiKey, workspaceId}, '凭证环境变量');
}
