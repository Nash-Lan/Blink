import { describe, expect, it } from 'vitest';
import { applyVisualResult, contentHash, enqueueAIJob, mockAnalyze, recoverInterruptedAIJobs, runMockAIJobs, sanitizeMermaid, updateMermaidVisual } from './ai';
import { defaultAppData, type Deadline, type Note } from './schema';
import { bucketDeadline, endOfLocalDay } from './time';
import { exportBackup, importBackup } from '../storage/backup';

function note(body = 'Q-learning observe -> act -> reward'): Note {
  return {
    id: 'note_1',
    title: 'Learning',
    body,
    tags: ['rl'],
    createdAt: '2026-10-11T00:00:00.000Z',
    updatedAt: '2026-10-11T00:00:00.000Z',
    contentVersion: 1,
    allowAI: true,
  };
}

function deadline(dueAt: string, completedAt: string | null = null): Deadline {
  return {
    id: 'ddl_1',
    title: 'Pay rent',
    notes: '',
    dueAt,
    reminderAt: null,
    completedAt,
    createdAt: '2026-10-11T00:00:00.000Z',
    updatedAt: '2026-10-11T00:00:00.000Z',
    contentVersion: 1,
    allowAI: true,
  };
}

describe('records and deadlines', () => {
  it('defaults unspecified date to local end of day', () => {
    const value = endOfLocalDay(new Date(2026, 9, 11, 8, 30));
    expect(value.getHours()).toBe(23);
    expect(value.getMinutes()).toBe(59);
  });

  it('buckets overdue, today, future, and completed deadlines', () => {
    const now = new Date(2026, 9, 11, 12, 0);
    expect(bucketDeadline(deadline(new Date(2026, 9, 10, 20, 0).toISOString()), now)).toBe('overdue');
    expect(bucketDeadline(deadline(new Date(2026, 9, 11, 20, 0).toISOString()), now)).toBe('today');
    expect(bucketDeadline(deadline(new Date(2026, 9, 12, 20, 0).toISOString()), now)).toBe('future');
    expect(bucketDeadline(deadline(new Date(2026, 9, 12, 20, 0).toISOString(), now.toISOString()), now)).toBe('completed');
  });
});

describe('visual ai', () => {
  it('rejects unsafe Mermaid syntax', () => {
    expect(() => sanitizeMermaid('flowchart TD\n  A --> B\n  click A href "https://x.test"')).toThrow();
  });

  it('accepts basic Mermaid flowcharts', () => {
    expect(sanitizeMermaid('flowchart TD\n  A[Observe] --> B[Act]\n  B --> C[Reward]')).toContain('flowchart TD');
  });

  it('accepts Mermaid labels with Unicode text and semicolons', () => {
    expect(sanitizeMermaid('flowchart TD\n  A[观察状态] --> B[选择动作];\n  B --> C[更新 Q 表];')).toContain('观察状态');
  });

  it('accepts basic Mermaid decision nodes and edge labels', () => {
    const definition = 'flowchart TD\n  A[Observe] --> B{Converged?}\n  B -->|No| A\n  B -->|Yes| C[Done]';
    expect(sanitizeMermaid(definition)).toContain('|Yes|');
  });

  it('rejects unsupported Mermaid init and HTML syntax', () => {
    expect(() => sanitizeMermaid('%%{init: {}}%%\nflowchart TD\n  A --> B')).toThrow();
    expect(() => sanitizeMermaid('flowchart TD\n  A[<b>Unsafe</b>] --> B')).toThrow();
  });

  it('does not enqueue duplicate jobs for the same content version and hash', () => {
    const data = { ...defaultAppData(), settings: { ...defaultAppData().settings, aiEnabled: true } };
    const first = enqueueAIJob({ ...data, notes: [note()] }, note(), 'note', 'hello');
    const second = enqueueAIJob(first, note(), 'note', 'hello');
    expect(second.aiJobs).toHaveLength(1);
    expect(contentHash('hello')).toBe(contentHash('hello'));
  });

  it('prevents stale AI results from overwriting changed records', () => {
    const data = { ...defaultAppData(), notes: [note()], settings: { ...defaultAppData().settings, aiEnabled: true, aiMockMode: true } };
    const queued = enqueueAIJob(data, note(), 'note', 'old');
    const changed = { ...queued, notes: [{ ...note(), contentVersion: 2 }] };
    const result = runMockAIJobs(changed);
    expect(result.visualAssets).toHaveLength(0);
    expect(result.aiJobs[0]?.status).toBe('failed');
  });

  it('classifies ordinary deadline text as an icon', () => {
    expect(mockAnalyze('Pay electricity bill', true).kind).toBe('icon');
  });

  it('classifies logical notes as Mermaid in mock mode', () => {
    expect(mockAnalyze('Q-learning observe -> act -> reward', false).kind).toBe('mermaid');
  });

  it('does not let stale AI overwrite a manually edited graph', () => {
    const base = defaultAppData();
    const data = {
      ...base,
      notes: [note()],
      settings: { ...base.settings, aiEnabled: true },
      visualAssets: [{
        id: 'visual_1',
        recordId: 'note_1',
        kind: 'mermaid' as const,
        version: 1 as const,
        definition: 'flowchart TD\n  A[User] --> B[Edited]',
        hidden: false,
        manuallyEdited: true,
        createdAt: '2026-10-11T00:00:00.000Z',
      }],
    };
    const queued = enqueueAIJob(data, note(), 'note', 'Q-learning observe -> act -> reward');
    const result = applyVisualResult(queued, queued.aiJobs[0]!.id, {
      kind: 'mermaid',
      version: 1,
      definition: 'flowchart TD\n  A[AI] --> B[Generated]',
    });
    expect(result.visualAssets[0]?.kind).toBe('mermaid');
    expect(result.visualAssets[0]?.manuallyEdited).toBe(true);
    expect(result.visualAssets[0]?.kind === 'mermaid' ? result.visualAssets[0].definition : '').toContain('User');
  });

  it('marks edited Mermaid as manual and validates before saving', () => {
    const data = {
      ...defaultAppData(),
      visualAssets: [{
        id: 'visual_1',
        recordId: 'note_1',
        kind: 'mermaid' as const,
        version: 1 as const,
        definition: 'flowchart TD\n  A[Old] --> B[Graph]',
        hidden: false,
        manuallyEdited: false,
        createdAt: '2026-10-11T00:00:00.000Z',
      }],
    };
    const result = updateMermaidVisual(data, 'visual_1', 'flowchart LR\n  A[New] --> B[Graph]');
    expect(result.visualAssets[0]?.manuallyEdited).toBe(true);
    expect(result.visualAssets[0]?.kind === 'mermaid' ? result.visualAssets[0].definition : '').toContain('flowchart LR');
  });

  it('recovers interrupted processing AI jobs as pending', () => {
    const data = defaultAppData();
    const queued = enqueueAIJob({ ...data, notes: [note()], settings: { ...data.settings, aiEnabled: true } }, note(), 'note', 'coffee');
    const processing = {
      ...queued,
      aiJobs: queued.aiJobs.map((job) => ({ ...job, status: 'processing' as const, error: null })),
    };

    const recovered = recoverInterruptedAIJobs(processing);

    expect(recovered.aiJobs[0]?.status).toBe('pending');
    expect(recovered.aiJobs[0]?.nextAttemptAt).toBeNull();
    expect(recovered.aiJobs[0]?.error).toContain('interrupted');
  });
});

describe('backup', () => {
  it('exports and restores without API key state', () => {
    const data = { ...defaultAppData(), settings: { ...defaultAppData().settings, hasDeepSeekKey: true } };
    const restored = importBackup(exportBackup(data));
    expect(restored.settings.hasDeepSeekKey).toBe(false);
  });

  it('rejects damaged backup JSON', () => {
    expect(() => importBackup('{"version":99}')).toThrow();
  });
});
