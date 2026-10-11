import { z } from 'zod';
import type { AIJob, AppData, Deadline, Note, VisualAsset } from './schema';

export const predefinedIcons = [
  { icon: 'sparkles-outline', label: 'Thought', match: ['idea', 'thought', '闪念', '想法'] },
  { icon: 'flag-outline', label: 'Deadline', match: ['deadline', 'due', 'ddl', '截止'] },
  { match: ['coffee', 'latte', 'espresso', '咖啡'], icon: 'cafe', label: 'Coffee' },
  { match: ['study', 'learn', 'q-learning', '学习', '阅读'], icon: 'book-outline', label: 'Study' },
  { match: ['call', 'meeting', '会议', '电话'], icon: 'people-outline', label: 'Meeting' },
  { match: ['pay', 'bill', 'rent', '付款', '账单'], icon: 'card-outline', label: 'Payment' },
  { match: ['run', 'gym', '健身', '运动'], icon: 'fitness-outline', label: 'Health' },
  { match: ['write', 'draft', 'essay', '写作'], icon: 'pencil-outline', label: 'Writing' },
  { match: ['code', 'bug', 'program', '代码'], icon: 'code-slash-outline', label: 'Code' },
  { match: ['travel', 'flight', 'trip', '旅行'], icon: 'airplane-outline', label: 'Travel' },
  { match: ['food', 'dinner', 'lunch', '吃饭'], icon: 'restaurant-outline', label: 'Food' },
  { match: ['home', 'clean', '家务'], icon: 'home-outline', label: 'Home' },
];

export const allowedIconNames = predefinedIcons.map((item) => item.icon) as [string, ...string[]];

export const deepSeekVisualResponseSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('icon'), version: z.literal(1), icon: z.enum(allowedIconNames), label: z.string().min(1).max(80) }),
  z.object({ kind: z.literal('mermaid'), version: z.literal(1), definition: z.string().max(4000) }),
  z.object({ kind: z.literal('chart'), version: z.literal(1), title: z.string(), data: z.array(z.object({ label: z.string(), value: z.number(), unit: z.string().optional() })) }),
  z.object({ kind: z.literal('function'), version: z.literal(1), expression: z.string().max(200) }),
  z.object({ kind: z.literal('none'), version: z.literal(1) }),
]);

export type DeepSeekVisualResponse = z.infer<typeof deepSeekVisualResponseSchema>;

export const deepSeekIconResponseSchema = z.object({
  kind: z.literal('icon'),
  version: z.literal(1),
  icon: z.enum(allowedIconNames),
  label: z.string().min(1).max(80),
});
export type DeepSeekIconResponse = z.infer<typeof deepSeekIconResponseSchema>;

export const deepSeekGraphResponseSchema = z.discriminatedUnion('kind', [
  deepSeekIconResponseSchema,
  z.object({
    kind: z.literal('mermaid'),
    version: z.literal(1),
    definition: z.string().min(1).max(4000),
  }),
]);
export type DeepSeekGraphResponse = z.infer<typeof deepSeekGraphResponseSchema>;

export function contentHash(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return String(hash >>> 0);
}

export function mockAnalyze(text: string, preferSmallIcon: boolean): DeepSeekVisualResponse {
  const lower = text.toLowerCase();
  if (!preferSmallIcon && (lower.includes('->') || lower.includes('流程') || lower.includes('q-learning'))) {
    return {
      kind: 'mermaid',
      version: 1,
      definition: 'flowchart TD\n  A[Observe state] --> B[Choose action]\n  B --> C[Receive reward]\n  C --> D[Update Q table]',
    };
  }
  const found = predefinedIcons.find((item) => item.match.some((word) => lower.includes(word.toLowerCase())));
  return {
    kind: 'icon',
    version: 1,
    icon: found?.icon ?? (preferSmallIcon ? 'flag-outline' : 'sparkles-outline'),
    label: found?.label ?? (preferSmallIcon ? 'Deadline' : 'Thought'),
  };
}

export function visualFromResponse(recordId: string, response: DeepSeekVisualResponse, now = new Date()): VisualAsset {
  const base = {
    id: makeId('visual'),
    recordId,
    version: 1 as const,
    hidden: false,
    manuallyEdited: false,
    createdAt: now.toISOString(),
  };
  switch (response.kind) {
    case 'icon':
      return { ...base, kind: 'icon', icon: response.icon, label: response.label };
    case 'mermaid':
      return { ...base, kind: 'mermaid', definition: sanitizeMermaid(response.definition) };
    case 'chart':
      return { ...base, kind: 'chart', title: response.title, data: response.data };
    case 'function':
      return { ...base, kind: 'function', expression: response.expression };
    case 'none':
      return { ...base, kind: 'none' };
  }
}

export function sanitizeMermaid(definition: string): string {
  const trimmed = definition.trim().slice(0, 4000);
  if (definition.length > 4000) {
    throw new Error('Mermaid definition is too long.');
  }
  if (!/^(flowchart|graph)\s+(TD|LR|TB|RL)/i.test(trimmed)) {
    throw new Error('Only basic Mermaid flowchart/graph syntax is supported.');
  }
  if (/[<]|script|classDef|click|href|%%\{|init|javascript:|html|style\s+/i.test(trimmed)) {
    throw new Error('Mermaid definition contains unsupported syntax.');
  }
  const lines = trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length > 60) {
    throw new Error('Mermaid definition has too many lines.');
  }
  const body = lines.slice(1);
  const edges = body.filter((line) => /-->|---|-.->|==>/.test(line)).length;
  if (edges > 50) {
    throw new Error('Mermaid definition has too many connections.');
  }
  const nodeIds = new Set<string>();
  for (const line of body) {
    const parts = line.split(/-->|---|-.->|==>/).map((part) => part.trim());
    for (const part of parts) {
      const match = /^([A-Za-z][A-Za-z0-9_-]{0,32})/.exec(part);
      if (match) {
        nodeIds.add(match[1]);
      }
    }
    if (!/^[\p{L}\p{N}_\-\s\[\]\{\}\(\)\|"'.:,/?;]+((-->|---|-.->|==>)[\p{L}\p{N}_\-\s\[\]\{\}\(\)\|"'.:,/?;]+)?$/u.test(line)) {
      throw new Error('Mermaid definition contains unsupported characters.');
    }
  }
  if (nodeIds.size > 40) {
    throw new Error('Mermaid definition has too many nodes.');
  }
  return trimmed;
}

export function enqueueAIJob(data: AppData, record: Note | Deadline, recordType: 'note' | 'deadline', text: string): AppData {
  if (!record.allowAI || !data.settings.aiEnabled) {
    return data;
  }
  const hash = contentHash(text);
  const exists = data.aiJobs.some((job) => job.recordId === record.id && job.contentHash === hash && job.contentVersion === record.contentVersion);
  if (exists) {
    return data;
  }
  const now = new Date().toISOString();
  const job: AIJob = {
    id: makeId('job'),
    recordId: record.id,
    recordType,
    contentHash: hash,
    contentVersion: record.contentVersion,
    status: 'pending',
    error: null,
    attempts: 0,
    nextAttemptAt: null,
    createdAt: now,
    updatedAt: now,
  };
  return { ...data, aiJobs: [...data.aiJobs, job] };
}

export function runMockAIJobs(data: AppData): AppData {
  if (!data.settings.aiEnabled || !data.settings.aiMockMode) {
    return data;
  }
  let next = data;
  for (const job of data.aiJobs.filter((item) => item.status === 'pending')) {
    const record = job.recordType === 'note'
      ? next.notes.find((note) => note.id === job.recordId)
      : next.deadlines.find((deadline) => deadline.id === job.recordId);
    if (!record || record.contentVersion !== job.contentVersion) {
      next = updateJob(next, job.id, 'failed', 'Record was changed or deleted before analysis completed.');
      continue;
    }
    try {
      const text = job.recordType === 'note' ? `${(record as Note).title}\n${(record as Note).body}` : (record as Deadline).title;
      const response = mockAnalyze(text, job.recordType === 'deadline');
      const visual = visualFromResponse(record.id, response);
      next = {
        ...next,
        visualAssets: [...next.visualAssets.filter((asset) => asset.recordId !== record.id || asset.manuallyEdited), visual],
      };
      next = updateJob(next, job.id, 'completed', null, 0, null);
    } catch (error) {
      next = updateJob(next, job.id, 'failed', error instanceof Error ? error.message : 'AI failed.', job.attempts + 1, null);
    }
  }
  return next;
}

export function recoverInterruptedAIJobs(data: AppData): AppData {
  const now = new Date().toISOString();
  let changed = false;
  const aiJobs = data.aiJobs.map((job) => {
    if (job.status !== 'processing') {
      return job;
    }
    changed = true;
    return {
      ...job,
      status: 'pending' as const,
      error: 'Previous AI request was interrupted and will be retried.',
      nextAttemptAt: null,
      updatedAt: now,
    };
  });
  return changed ? { ...data, aiJobs } : data;
}

function updateJob(data: AppData, id: string, status: AIJob['status'], error: string | null, attempts?: number, nextAttemptAt?: string | null): AppData {
  const now = new Date().toISOString();
  return {
    ...data,
    aiJobs: data.aiJobs.map((job) => (job.id === id ? { ...job, status, error, attempts: attempts ?? job.attempts, nextAttemptAt: nextAttemptAt ?? job.nextAttemptAt, updatedAt: now } : job)),
  };
}

export function applyVisualResult(data: AppData, jobId: string, response: DeepSeekGraphResponse): AppData {
  const job = data.aiJobs.find((item) => item.id === jobId);
  if (!job) {
    return data;
  }
  const record = job.recordType === 'note'
    ? data.notes.find((item) => item.id === job.recordId)
    : data.deadlines.find((item) => item.id === job.recordId);
  if (!record || record.contentVersion !== job.contentVersion) {
    return failAIJob(data, jobId, 'Record changed before AI finished.', false);
  }
  if (job.recordType === 'deadline' && response.kind !== 'icon') {
    return failAIJob(data, jobId, 'Deadlines only support icon AI results.', false);
  }
  const existingManual = data.visualAssets.some((asset) => asset.recordId === job.recordId && asset.manuallyEdited);
  if (existingManual) {
    return {
      ...data,
      aiJobs: data.aiJobs.map((item) => item.id === jobId ? { ...item, status: 'completed', error: null, updatedAt: new Date().toISOString() } : item),
    };
  }
  const visual = visualFromResponse(job.recordId, response);
  const now = new Date().toISOString();
  return {
    ...data,
    visualAssets: [...data.visualAssets.filter((asset) => asset.recordId !== job.recordId || asset.manuallyEdited), visual],
    aiCache: [
      ...data.aiCache.filter((item) => !(item.recordType === job.recordType && item.contentHash === job.contentHash)),
      { id: makeId('cache'), recordType: job.recordType, contentHash: job.contentHash, response, createdAt: now },
    ],
    aiJobs: data.aiJobs.map((item) => item.id === jobId ? { ...item, status: 'completed', error: null, updatedAt: now } : item),
  };
}

export const applyIconResult = applyVisualResult;

export function applyCachedIconResult(data: AppData, jobId: string): AppData {
  const job = data.aiJobs.find((item) => item.id === jobId);
  if (!job) {
    return data;
  }
  const cached = data.aiCache.find((item) => item.recordType === job.recordType && item.contentHash === job.contentHash);
  return cached ? applyVisualResult(data, jobId, cached.response) : data;
}

export function failAIJob(data: AppData, jobId: string, message: string, retryable: boolean): AppData {
  const now = new Date();
  return {
    ...data,
    aiJobs: data.aiJobs.map((job) => {
      if (job.id !== jobId) {
        return job;
      }
      const attempts = job.attempts + 1;
      const retryDelayMs = attempts === 1 ? 1000 : attempts === 2 ? 3000 : 10000;
      const nextAttemptAt = retryable && attempts < 3 ? new Date(now.getTime() + retryDelayMs).toISOString() : null;
      return {
        ...job,
        status: retryable && attempts < 3 ? 'pending' : 'failed',
        attempts,
        nextAttemptAt,
        error: message,
        updatedAt: now.toISOString(),
      };
    }),
  };
}

export function markAIJobProcessing(data: AppData, jobId: string): AppData {
  const now = new Date().toISOString();
  return {
    ...data,
    aiJobs: data.aiJobs.map((job) => job.id === jobId ? { ...job, status: 'processing', error: null, updatedAt: now } : job),
  };
}

export function updateMermaidVisual(data: AppData, visualId: string, definition: string): AppData {
  const safe = sanitizeMermaid(definition);
  return {
    ...data,
    visualAssets: data.visualAssets.map((asset) => asset.id === visualId && asset.kind === 'mermaid'
      ? { ...asset, definition: safe, manuallyEdited: true, hidden: false }
      : asset),
  };
}

export function hideVisualAsset(data: AppData, visualId: string): AppData {
  return {
    ...data,
    visualAssets: data.visualAssets.map((asset) => asset.id === visualId ? { ...asset, hidden: true, manuallyEdited: true } : asset),
  };
}

export function requestRegenerateVisual(data: AppData, recordId: string): AppData {
  const note = data.notes.find((item) => item.id === recordId);
  if (!note) {
    return data;
  }
  const withoutJobs = {
    ...data,
    aiJobs: data.aiJobs.filter((job) => job.recordId !== recordId || job.status === 'completed'),
    visualAssets: data.visualAssets.map((asset) => asset.recordId === recordId ? { ...asset, manuallyEdited: false, hidden: false } : asset),
  };
  return enqueueAIJob(withoutJobs, note, 'note', `${note.title}\n${note.body}`);
}

export function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}
