import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { Alert, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { ZodError } from 'zod';
import { aiRequest } from '../ai/request';
import { applyCachedIconResult, applyVisualResult, enqueueAIJob, failAIJob, hideVisualAsset, makeId, markAIJobProcessing, recoverInterruptedAIJobs, requestRegenerateVisual, runMockAIJobs, updateMermaidVisual } from '../domain/ai';
import { defaultAppData, type AppData, type Deadline, type Note, type Settings, type VisualAsset } from '../domain/schema';
import { endOfLocalDay } from '../domain/time';
import { exportBackup, importBackup } from '../storage/backup';
import { storage } from '../storage';

type CreateDeadlineInput = {
  title: string;
  dueDate?: Date;
  reminderAt?: Date | null;
};

type BlinkContextValue = {
  data: AppData;
  ready: boolean;
  notes: Note[];
  deadlines: Deadline[];
  lastCompletedDeadline: Pick<Deadline, 'id' | 'title' | 'completedAt'> | null;
  visualFor(recordId: string): VisualAsset | undefined;
  saveDraft(text: string, mode: Settings['draftMode']): void;
  createNote(body: string, tags?: string[]): Promise<void>;
  updateNote(id: string, patch: Partial<Pick<Note, 'title' | 'body' | 'tags' | 'allowAI'>>): Promise<void>;
  deleteNote(id: string): Promise<void>;
  createDeadline(input: CreateDeadlineInput): Promise<void>;
  updateDeadline(id: string, patch: Partial<Pick<Deadline, 'title' | 'notes' | 'dueAt' | 'reminderAt' | 'allowAI'>>): Promise<void>;
  toggleDeadline(id: string): Promise<void>;
  undoLastCompletedDeadline(): Promise<void>;
  deleteDeadline(id: string): Promise<void>;
  updateSettings(patch: Partial<Settings>): Promise<void>;
  saveMermaidVisual(visualId: string, definition: string): Promise<void>;
  hideVisual(visualId: string): Promise<void>;
  regenerateVisual(recordId: string): Promise<void>;
  backup(): string;
  restore(raw: string): Promise<void>;
};

const BlinkContext = createContext<BlinkContextValue | null>(null);

export function BlinkProvider({ children }: PropsWithChildren) {
  const [data, setData] = useState<AppData>(defaultAppData);
  const [ready, setReady] = useState(false);
  const [retryTick, setRetryTick] = useState(0);
  const [lastCompletedDeadline, setLastCompletedDeadline] = useState<Pick<Deadline, 'id' | 'title' | 'completedAt'> | null>(null);
  const dataRef = useRef<AppData>(defaultAppData());
  const commitQueueRef = useRef(Promise.resolve());
  const processingAIJobsRef = useRef(new Set<string>());

  useEffect(() => {
    let mounted = true;
    storage.load()
      .then((loaded) => {
        if (mounted && loaded) {
          const hydrated = runMockAIJobs(recoverInterruptedAIJobs(loaded));
          dataRef.current = hydrated;
          setData(hydrated);
          debugLog('storage.load.success', { notes: hydrated.notes.length, deadlines: hydrated.deadlines.length });
        }
      })
      .catch((error) => {
        debugLog('storage.load.failed', { message: error instanceof Error ? error.message : 'Unknown error' });
        if (Platform.OS !== 'web') {
          Alert.alert('Storage unavailable', 'Blink will keep running, but persistence needs attention.');
        }
      })
      .finally(() => {
        if (mounted) {
          setReady(true);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  const commit = useCallback(async (label: string, producer: (current: AppData) => AppData) => {
    const run = commitQueueRef.current.then(async () => {
      const nextData = runMockAIJobs(producer(dataRef.current));
      debugLog(`${label}.validated`, { notes: nextData.notes.length, deadlines: nextData.deadlines.length, jobs: nextData.aiJobs.length });
      await storage.save(nextData);
      debugLog(`${label}.persisted`, { notes: nextData.notes.length, deadlines: nextData.deadlines.length });
      dataRef.current = nextData;
      setData(nextData);
      debugLog(`${label}.state-updated`, { notes: nextData.notes.length, deadlines: nextData.deadlines.length });
    });
    commitQueueRef.current = run.catch(() => undefined);
    await run;
  }, []);

  useEffect(() => {
    if (!ready || !data.settings.aiEnabled || data.settings.aiMockMode || !data.settings.aiConsentGranted) {
      return undefined;
    }
    const interval = setInterval(() => setRetryTick((value) => value + 1), 2000);
    return () => clearInterval(interval);
  }, [ready, data.settings.aiEnabled, data.settings.aiMockMode, data.settings.aiConsentGranted]);

  useEffect(() => {
    if (!ready || !data.settings.aiEnabled || data.settings.aiMockMode || !data.settings.aiConsentGranted) {
      return;
    }
    const now = Date.now();
    const job = data.aiJobs.find((item) => {
      if (item.status !== 'pending' || processingAIJobsRef.current.has(item.id)) {
        return false;
      }
      return !item.nextAttemptAt || new Date(item.nextAttemptAt).getTime() <= now;
    });
    if (!job) {
      return;
    }
    const cached = data.aiCache.find((item) => item.recordType === job.recordType && item.contentHash === job.contentHash);
    if (cached) {
      void commit('ai.cache-hit', (current) => applyCachedIconResult(current, job.id));
      return;
    }
    const record = job.recordType === 'note'
      ? data.notes.find((item) => item.id === job.recordId)
      : data.deadlines.find((item) => item.id === job.recordId);
    if (!record || record.contentVersion !== job.contentVersion) {
      void commit('ai.stale-job', (current) => failAIJob(current, job.id, 'Record changed before AI started.', false));
      return;
    }
    const text = job.recordType === 'note' ? `${(record as Note).title}\n${(record as Note).body}` : (record as Deadline).title;
    processingAIJobsRef.current.add(job.id);
    void (async () => {
      try {
        await commit('ai.processing', (current) => markAIJobProcessing(current, job.id));
        const response = await aiRequest.analyzeIcon({
          text,
          recordType: job.recordType,
          model: data.settings.deepSeekModel,
          proxyUrl: data.settings.deepSeekProxyUrl,
        });
        await commit('ai.completed', (current) => applyVisualResult(current, job.id, response));
      } catch (error) {
        const retryable = !(error instanceof ZodError);
        const message = error instanceof Error ? error.message : 'AI request failed.';
        await commit('ai.failed', (current) => failAIJob(current, job.id, message, retryable));
      } finally {
        processingAIJobsRef.current.delete(job.id);
      }
    })();
  }, [ready, data, retryTick, commit]);

  const feedback = useCallback(() => {
    if (Platform.OS !== 'web') {
      void Haptics.selectionAsync();
    }
  }, []);

  const createNote = useCallback(async (body: string, tags: string[] = []) => {
    const now = new Date().toISOString();
    const note: Note = {
      id: makeId('note'),
      title: firstLine(body),
      body,
      tags,
      createdAt: now,
      updatedAt: now,
      contentVersion: 1,
      allowAI: true,
    };
    debugLog('note.create.clicked', { bodyLength: body.length, tags: tags.length });
    await commit('note.create', (current) => enqueueAIJob({ ...current, notes: [note, ...current.notes], settings: { ...current.settings, draftText: '' } }, note, 'note', `${note.title}\n${note.body}`));
    feedback();
  }, [commit, feedback]);

  const updateNote = useCallback(async (id: string, patch: Partial<Pick<Note, 'title' | 'body' | 'tags' | 'allowAI'>>) => {
    await commit('note.update', (current) => {
      const note = current.notes.find((item) => item.id === id);
      const nextNotes = current.notes.map((item) => {
        if (item.id !== id) {
          return item;
        }
        const contentChanged = patch.title !== undefined || patch.body !== undefined || patch.tags !== undefined;
        return { ...item, ...patch, updatedAt: new Date().toISOString(), contentVersion: contentChanged ? item.contentVersion + 1 : item.contentVersion };
      });
      const updated = nextNotes.find((item) => item.id === id);
      const base = { ...current, notes: nextNotes };
      if (!note || !updated || note.contentVersion === updated.contentVersion) {
        return base;
      }
      return enqueueAIJob(base, updated, 'note', `${updated.title}\n${updated.body}`);
    });
  }, [commit]);

  const deleteNote = useCallback(async (id: string) => {
    await commit('note.delete', (current) => ({
      ...current,
      notes: current.notes.filter((note) => note.id !== id),
      visualAssets: current.visualAssets.filter((asset) => asset.recordId !== id),
      aiJobs: current.aiJobs.filter((job) => job.recordId !== id),
    }));
  }, [commit]);

  const createDeadline = useCallback(async (input: CreateDeadlineInput) => {
    const now = new Date().toISOString();
    const due = input.dueDate ? new Date(input.dueDate) : endOfLocalDay(new Date());
    const deadline: Deadline = {
      id: makeId('ddl'),
      title: input.title.trim(),
      notes: '',
      dueAt: due.toISOString(),
      reminderAt: input.reminderAt?.toISOString() ?? null,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
      contentVersion: 1,
      allowAI: true,
    };
    debugLog('deadline.create.clicked', { titleLength: input.title.length, hasReminder: Boolean(input.reminderAt) });
    await commit('deadline.create', (current) => enqueueAIJob({ ...current, deadlines: [...current.deadlines, deadline], settings: { ...current.settings, draftText: '' } }, deadline, 'deadline', deadline.title));
    feedback();
  }, [commit, feedback]);

  const updateDeadline = useCallback(async (id: string, patch: Partial<Pick<Deadline, 'title' | 'notes' | 'dueAt' | 'reminderAt' | 'allowAI'>>) => {
    await commit('deadline.update', (current) => {
      const nextDeadlines = current.deadlines.map((item) => {
        if (item.id !== id) {
          return item;
        }
        const contentChanged = patch.title !== undefined || patch.notes !== undefined || patch.dueAt !== undefined;
        return { ...item, ...patch, updatedAt: new Date().toISOString(), contentVersion: contentChanged ? item.contentVersion + 1 : item.contentVersion };
      });
      const updated = nextDeadlines.find((item) => item.id === id);
      const base = { ...current, deadlines: nextDeadlines };
      if (!updated || patch.title === undefined) {
        return base;
      }
      return enqueueAIJob(base, updated, 'deadline', updated.title);
    });
  }, [commit]);

  const toggleDeadline = useCallback(async (id: string) => {
    const deadline = dataRef.current.deadlines.find((item) => item.id === id);
    const isCompleting = Boolean(deadline && !deadline.completedAt);
    await commit('deadline.toggle', (current) => ({
      ...current,
      deadlines: current.deadlines.map((item) => item.id === id ? { ...item, completedAt: item.completedAt ? null : new Date().toISOString(), updatedAt: new Date().toISOString() } : item),
    }));
    setLastCompletedDeadline(isCompleting && deadline ? { id: deadline.id, title: deadline.title, completedAt: new Date().toISOString() } : null);
    feedback();
  }, [commit, feedback]);

  const undoLastCompletedDeadline = useCallback(async () => {
    const target = lastCompletedDeadline;
    if (!target) {
      return;
    }
    await commit('deadline.undo-complete', (current) => ({
      ...current,
      deadlines: current.deadlines.map((item) => item.id === target.id ? { ...item, completedAt: null, updatedAt: new Date().toISOString() } : item),
    }));
    setLastCompletedDeadline(null);
    feedback();
  }, [commit, feedback, lastCompletedDeadline]);

  const deleteDeadline = useCallback(async (id: string) => {
    await commit('deadline.delete', (current) => ({
      ...current,
      deadlines: current.deadlines.filter((deadline) => deadline.id !== id),
      visualAssets: current.visualAssets.filter((asset) => asset.recordId !== id),
      aiJobs: current.aiJobs.filter((job) => job.recordId !== id),
    }));
    setLastCompletedDeadline((current) => current?.id === id ? null : current);
  }, [commit]);

  const updateSettings = useCallback(async (patch: Partial<Settings>) => {
    await commit('settings.update', (current) => ({ ...current, settings: { ...current.settings, ...patch } }));
  }, [commit]);

  const saveMermaidVisual = useCallback(async (visualId: string, definition: string) => {
    await commit('visual.mermaid.update', (current) => updateMermaidVisual(current, visualId, definition));
  }, [commit]);

  const hideVisual = useCallback(async (visualId: string) => {
    await commit('visual.hide', (current) => hideVisualAsset(current, visualId));
  }, [commit]);

  const regenerateVisual = useCallback(async (recordId: string) => {
    await commit('visual.regenerate', (current) => requestRegenerateVisual(current, recordId));
  }, [commit]);

  const saveDraft = useCallback((text: string, mode: Settings['draftMode']) => {
    void updateSettings({ draftText: text, draftMode: mode });
  }, [updateSettings]);

  const restore = useCallback(async (raw: string) => {
    const restored = importBackup(raw);
    await storage.save(restored);
    dataRef.current = restored;
    setData(restored);
    setLastCompletedDeadline(null);
  }, []);

  const value = useMemo<BlinkContextValue>(() => ({
    data,
    ready,
    notes: [...data.notes].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    deadlines: data.deadlines,
    lastCompletedDeadline,
    visualFor: (recordId) => data.visualAssets.find((asset) => asset.recordId === recordId && !asset.hidden),
    saveDraft,
    createNote,
    updateNote,
    deleteNote,
    createDeadline,
    updateDeadline,
    toggleDeadline,
    undoLastCompletedDeadline,
    deleteDeadline,
    updateSettings,
    saveMermaidVisual,
    hideVisual,
    regenerateVisual,
    backup: () => exportBackup(data),
    restore,
  }), [data, ready, lastCompletedDeadline, saveDraft, createNote, updateNote, deleteNote, createDeadline, updateDeadline, toggleDeadline, undoLastCompletedDeadline, deleteDeadline, updateSettings, saveMermaidVisual, hideVisual, regenerateVisual, restore]);

  return <BlinkContext.Provider value={value}>{children}</BlinkContext.Provider>;
}

export function useBlink() {
  const context = useContext(BlinkContext);
  if (!context) {
    throw new Error('useBlink must be used within BlinkProvider.');
  }
  return context;
}

function firstLine(value: string): string {
  return value.trim().split(/\r?\n/)[0]?.slice(0, 80) || 'Untitled';
}

function debugLog(event: string, details: Record<string, unknown>) {
  if (__DEV__) {
    console.info(`[Blink save] ${event}`, details);
  }
}
