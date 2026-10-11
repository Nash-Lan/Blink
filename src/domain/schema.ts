import { z } from 'zod';

export const visualKindSchema = z.enum(['icon', 'mermaid', 'chart', 'function', 'none']);
export type VisualKind = z.infer<typeof visualKindSchema>;

export const aiStatusSchema = z.enum(['pending', 'processing', 'completed', 'failed']);
export type AIStatus = z.infer<typeof aiStatusSchema>;

export const visualAssetSchema = z.discriminatedUnion('kind', [
  z.object({
    id: z.string(),
    recordId: z.string(),
    kind: z.literal('icon'),
    version: z.literal(1),
    icon: z.string().min(1).max(40),
    label: z.string().max(80),
    hidden: z.boolean().default(false),
    manuallyEdited: z.boolean().default(false),
    createdAt: z.string(),
  }),
  z.object({
    id: z.string(),
    recordId: z.string(),
    kind: z.literal('mermaid'),
    version: z.literal(1),
    definition: z.string().min(1).max(4000),
    hidden: z.boolean().default(false),
    manuallyEdited: z.boolean().default(false),
    createdAt: z.string(),
  }),
  z.object({
    id: z.string(),
    recordId: z.string(),
    kind: z.literal('chart'),
    version: z.literal(1),
    title: z.string(),
    data: z.array(z.object({ label: z.string(), value: z.number(), unit: z.string().optional() })),
    hidden: z.boolean().default(false),
    manuallyEdited: z.boolean().default(false),
    createdAt: z.string(),
  }),
  z.object({
    id: z.string(),
    recordId: z.string(),
    kind: z.literal('function'),
    version: z.literal(1),
    expression: z.string().max(200),
    hidden: z.boolean().default(false),
    manuallyEdited: z.boolean().default(false),
    createdAt: z.string(),
  }),
  z.object({
    id: z.string(),
    recordId: z.string(),
    kind: z.literal('none'),
    version: z.literal(1),
    hidden: z.boolean().default(false),
    manuallyEdited: z.boolean().default(false),
    createdAt: z.string(),
  }),
]);
export type VisualAsset = z.infer<typeof visualAssetSchema>;

export const noteSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  tags: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
  contentVersion: z.number().int().nonnegative(),
  allowAI: z.boolean().default(true),
});
export type Note = z.infer<typeof noteSchema>;

export const deadlineSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  notes: z.string().default(''),
  dueAt: z.string(),
  reminderAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  contentVersion: z.number().int().nonnegative(),
  allowAI: z.boolean().default(true),
});
export type Deadline = z.infer<typeof deadlineSchema>;

export const aiJobSchema = z.object({
  id: z.string(),
  recordId: z.string(),
  recordType: z.enum(['note', 'deadline']),
  contentHash: z.string(),
  contentVersion: z.number().int().nonnegative(),
  status: aiStatusSchema,
  error: z.string().nullable(),
  attempts: z.number().int().nonnegative().default(0),
  nextAttemptAt: z.string().nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AIJob = z.infer<typeof aiJobSchema>;

export const aiCacheItemSchema = z.object({
  id: z.string(),
  recordType: z.enum(['note', 'deadline']),
  contentHash: z.string(),
  response: z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('icon'),
      version: z.literal(1),
      icon: z.string(),
      label: z.string(),
    }),
    z.object({
      kind: z.literal('mermaid'),
      version: z.literal(1),
      definition: z.string(),
    }),
  ]),
  createdAt: z.string(),
});
export type AICacheItem = z.infer<typeof aiCacheItemSchema>;

export const settingsSchema = z.object({
  aiEnabled: z.boolean().default(false),
  aiMockMode: z.boolean().default(true),
  deepSeekModel: z.string().default('deepseek-flash'),
  hasDeepSeekKey: z.boolean().default(false),
  aiConsentGranted: z.boolean().default(false),
  deepSeekProxyUrl: z.string().default('http://127.0.0.1:8787/v1/analyze-icon'),
  draftText: z.string().default(''),
  draftMode: z.enum(['note', 'deadline']).default('note'),
});
export type Settings = z.infer<typeof settingsSchema>;

export const appDataSchema = z.object({
  version: z.literal(1),
  notes: z.array(noteSchema),
  deadlines: z.array(deadlineSchema),
  visualAssets: z.array(visualAssetSchema),
  aiJobs: z.array(aiJobSchema),
  aiCache: z.array(aiCacheItemSchema).default([]),
  settings: settingsSchema,
});
export type AppData = z.infer<typeof appDataSchema>;

export const backupSchema = appDataSchema.extend({
  exportedAt: z.string(),
});
export type BackupData = z.infer<typeof backupSchema>;

export function defaultAppData(): AppData {
  return {
    version: 1,
    notes: [],
    deadlines: [],
    visualAssets: [],
    aiJobs: [],
    aiCache: [],
    settings: {
      aiEnabled: false,
      aiMockMode: true,
      deepSeekModel: 'deepseek-flash',
      hasDeepSeekKey: false,
      aiConsentGranted: false,
      deepSeekProxyUrl: 'http://127.0.0.1:8787/v1/analyze-icon',
      draftText: '',
      draftMode: 'note',
    },
  };
}
