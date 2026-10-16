import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { Alert, AppState, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { ZodError } from 'zod';
import { aiRequest } from '../ai/request';
import { applyCachedIconResult, applyVisualResult, enqueueAIJob, failAIJob, hideVisualAsset, makeId, markAIJobProcessing, recoverInterruptedAIJobs, requestRegenerateVisual, runMockAIJobs, updateMermaidVisual } from '../domain/ai';
import { defaultAppData, type AppData, type Deadline, type Note, type Settings, type VisualAsset } from '../domain/schema';
import { findDueReminder, markReminderShown, nextReminderDelay, reminderKey, resolveActiveReminder, validateReminderAt, type ReminderEvent } from '../domain/reminders';
import { endOfLocalDay } from '../domain/time';
import { exportBackup, importBackup } from '../storage/backup';
import { notificationBindingStore, storage } from '../storage';
import { nativeNotificationAdapter } from '../notifications/adapter';
import { NativeNotificationCoordinator } from '../notifications/coordinator';
import { permissionForExplicitEnable } from '../notifications/permissions';
import type { NativeNotificationPermission } from '../notifications/types';
import { persistThenPublish, SerialTaskQueue, StorageLoadBarrier } from './commitQueue';

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
  activeReminder: ReminderEvent | null;
  nativeNotificationPermission: NativeNotificationPermission;
  nativeNotificationSyncing: boolean;
  nativeNotificationError: string | null;
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
  dismissActiveReminder(): void;
  acknowledgeNativeReminder(deadlineId: string, expectedReminderKey: string): Promise<void>;
  setNativeNotificationsEnabled(enabled: boolean): Promise<void>;
  reconcileNativeNotifications(): Promise<void>;
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
  const [reminderTick, setReminderTick] = useState(0);
  const [appState, setAppState] = useState(AppState.currentState ?? 'active');
  const [nativeNotificationPermission, setNativeNotificationPermission] = useState<NativeNotificationPermission>(nativeNotificationAdapter.supported ? 'undetermined' : 'unsupported');
  const [nativeNotificationSyncing, setNativeNotificationSyncing] = useState(false);
  const [nativeNotificationError, setNativeNotificationError] = useState<string | null>(null);
  const [lastCompletedDeadline, setLastCompletedDeadline] = useState<Pick<Deadline, 'id' | 'title' | 'completedAt'> | null>(null);
  const [reminderCandidate, setReminderCandidate] = useState<ReminderEvent | null>(null);
  // Validity follows the current deadline, so edits/completion never leave a stale banner for a frame.
  const activeReminder = useMemo(() => resolveActiveReminder(reminderCandidate, data.deadlines), [reminderCandidate, data.deadlines]);
  const dataRef = useRef<AppData>(defaultAppData());
  const [storageLoadBarrier] = useState(() => new StorageLoadBarrier());
  const hydrationStartedRef = useRef(false);
  const commitQueueRef = useRef(new SerialTaskQueue());
  const processingAIJobsRef = useRef(new Set<string>());
  const processingReminderRef = useRef<string | null>(null);
  const reminderRetryAfterRef = useRef(0);
  const mountedRef = useRef(false);
  const [nativeNotificationCoordinator] = useState(() => new NativeNotificationCoordinator(
    nativeNotificationAdapter,
    notificationBindingStore,
  ));

  const reconcileNativeNotifications = useCallback(async () => {
    if (!nativeNotificationCoordinator.supported) {
      setNativeNotificationPermission('unsupported');
      return;
    }
    try {
      // Never reconcile from the in-memory defaults when the persisted app snapshot
      // could not be read: doing so could cancel valid device notifications.
      await storageLoadBarrier.wait();
      setNativeNotificationSyncing(true);
      const permission = await nativeNotificationCoordinator.reconcileAll();
      if (mountedRef.current) {
        setNativeNotificationPermission(permission);
        setNativeNotificationError(null);
      }
    } catch (error) {
      if (mountedRef.current) {
        setNativeNotificationError(error instanceof Error ? error.message : 'Native notification sync failed.');
      }
    } finally {
      if (mountedRef.current) setNativeNotificationSyncing(false);
    }
  }, [nativeNotificationCoordinator, storageLoadBarrier]);

  useEffect(() => {
    mountedRef.current = true;
    nativeNotificationCoordinator.configureForegroundHandler();
    if (!hydrationStartedRef.current) {
      hydrationStartedRef.current = true;
      storage.load()
        .then((loaded) => {
          if (mountedRef.current && loaded) {
            const hydrated = runMockAIJobs(recoverInterruptedAIJobs(loaded));
            dataRef.current = hydrated;
            nativeNotificationCoordinator.updatePlan(hydrated.deadlines, hydrated.settings.nativeNotificationsEnabled);
            setData(hydrated);
            debugLog('storage.load.success', { notes: hydrated.notes.length, deadlines: hydrated.deadlines.length });
          }
        })
        .catch((error) => {
          storageLoadBarrier.fail(error);
          debugLog('storage.load.failed', { message: error instanceof Error ? error.message : 'Unknown error' });
          if (mountedRef.current && Platform.OS !== 'web') {
            Alert.alert('Storage unavailable', 'Blink will keep running, but persistence needs attention.');
          }
        })
        .finally(() => {
          storageLoadBarrier.complete();
          if (mountedRef.current) {
            setReady(true);
          }
        });
    }
    return () => {
      mountedRef.current = false;
    };
  }, [nativeNotificationCoordinator, storageLoadBarrier]);

  const commit = useCallback(async (label: string, producer: (current: AppData) => AppData) => {
    return commitQueueRef.current.enqueue(async () => {
      await storageLoadBarrier.wait();
      return persistThenPublish({
        getCurrent: () => dataRef.current,
        produce: (current) => {
          const nextData = runMockAIJobs(producer(current));
          debugLog(`${label}.validated`, { notes: nextData.notes.length, deadlines: nextData.deadlines.length, jobs: nextData.aiJobs.length });
          return nextData;
        },
        save: async (nextData) => {
          await storage.save(nextData);
          debugLog(`${label}.persisted`, { notes: nextData.notes.length, deadlines: nextData.deadlines.length });
        },
        publish: (nextData) => {
          const notificationPlanChanged = nativeNotificationPlanKey(dataRef.current) !== nativeNotificationPlanKey(nextData);
          dataRef.current = nextData;
          nativeNotificationCoordinator.updatePlan(nextData.deadlines, nextData.settings.nativeNotificationsEnabled);
          setData(nextData);
          // Clear invalid candidates as part of the mutation, so Undo cannot revive an old banner.
          setReminderCandidate((current) => resolveActiveReminder(current, nextData.deadlines));
          debugLog(`${label}.state-updated`, { notes: nextData.notes.length, deadlines: nextData.deadlines.length });
          if (notificationPlanChanged) void reconcileNativeNotifications();
        },
      });
    });
  }, [nativeNotificationCoordinator, reconcileNativeNotifications, storageLoadBarrier]);

  useEffect(() => {
    if (!ready || appState !== 'active') return undefined;
    const timeout = setTimeout(() => void reconcileNativeNotifications(), 0);
    return () => clearTimeout(timeout);
  }, [ready, appState, reconcileNativeNotifications]);

  useEffect(() => {
    if (!ready || !data.settings.aiEnabled || data.settings.aiMockMode || !data.settings.aiConsentGranted) {
      return undefined;
    }
    const interval = setInterval(() => setRetryTick((value) => value + 1), 2000);
    return () => clearInterval(interval);
  }, [ready, data.settings.aiEnabled, data.settings.aiMockMode, data.settings.aiConsentGranted]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', setAppState);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!ready || appState !== 'active' || activeReminder || processingReminderRef.current) {
      return;
    }
    const delay = nextReminderDelay(data.deadlines, data.reminderHistory);
    if (delay === null) {
      return;
    }
    // Wake at the due time; cap long waits to detect wall-clock changes while foregrounded.
    const wait = Math.max(Math.min(delay, 15_000), reminderRetryAfterRef.current - Date.now());
    const timeout = setTimeout(() => {
      if (AppState.currentState !== 'active' || processingReminderRef.current) {
        return;
      }
      const event = findDueReminder(dataRef.current.deadlines, dataRef.current.reminderHistory);
      if (!event) {
        setReminderTick((value) => value + 1);
        return;
      }
      processingReminderRef.current = event.key;
      let claimed = false;
      void commit('reminder.show', (current) => {
        // Recheck inside the serialized write: an edit may have been queued before this check.
        if (AppState.currentState !== 'active') {
          return current;
        }
        const next = markReminderShown(current, event);
        claimed = next !== current;
        return next;
      })
        .then(() => {
          if (claimed && mountedRef.current) {
            setReminderCandidate(resolveActiveReminder(event, dataRef.current.deadlines));
          }
        })
        .catch((error) => {
          reminderRetryAfterRef.current = Date.now() + 15_000;
          debugLog('reminder.show.failed', { message: error instanceof Error ? error.message : 'Reminder could not be saved.' });
        })
        .finally(() => {
          processingReminderRef.current = null;
          if (mountedRef.current) {
            setReminderTick((value) => value + 1);
          }
        });
    }, wait);
    return () => clearTimeout(timeout);
  }, [ready, appState, activeReminder, data.deadlines, data.reminderHistory, reminderTick, commit]);

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
    if (!Number.isFinite(due.getTime())) {
      throw new Error('Enter a valid deadline date and time.');
    }
    const reminderValidation = validateReminderAt(input.reminderAt ?? null);
    if (!reminderValidation.ok) {
      throw new Error(reminderValidation.message);
    }
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
        const dueAt = patch.dueAt ?? item.dueAt;
        if (!Number.isFinite(new Date(dueAt).getTime())) {
          throw new Error('Enter a valid deadline date and time.');
        }
        const reminderAt = patch.reminderAt === undefined ? item.reminderAt : patch.reminderAt;
        const reminderValidation = validateReminderAt(reminderAt === null ? null : new Date(reminderAt), {
          previousReminderAt: item.reminderAt,
          preserveExisting: dueAt === item.dueAt,
        });
        if (!reminderValidation.ok) {
          throw new Error(reminderValidation.message);
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
    const nextData = await commit('deadline.toggle', (current) => ({
      ...current,
      deadlines: current.deadlines.map((item) => item.id === id ? { ...item, completedAt: item.completedAt ? null : new Date().toISOString(), updatedAt: new Date().toISOString() } : item),
    }));
    const deadline = nextData.deadlines.find((item) => item.id === id);
    setLastCompletedDeadline(deadline?.completedAt
      ? { id: deadline.id, title: deadline.title, completedAt: deadline.completedAt }
      : null);
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

  const dismissActiveReminder = useCallback(() => {
    setReminderCandidate(null);
  }, []);

  const acknowledgeNativeReminder = useCallback(async (deadlineId: string, expectedReminderKey: string) => {
    await commit('reminder.native-response', (current) => {
      const deadline = current.deadlines.find((item) => item.id === deadlineId);
      if (!deadline || !deadline.reminderAt || reminderKey(deadline) !== expectedReminderKey) return current;
      return markReminderShown(current, {
        key: expectedReminderKey,
        deadlineId,
        title: deadline.title,
        dueAt: deadline.dueAt,
        reminderAt: deadline.reminderAt,
      });
    });
  }, [commit]);

  const setNativeNotificationsEnabled = useCallback(async (enabled: boolean) => {
    if (enabled && nativeNotificationCoordinator.supported) {
      const permission = await permissionForExplicitEnable(nativeNotificationCoordinator);
      setNativeNotificationPermission(permission);
    }
    await commit('settings.native-notifications', (current) => ({
      ...current,
      settings: { ...current.settings, nativeNotificationsEnabled: enabled },
    }));
  }, [commit, nativeNotificationCoordinator]);

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
    await commit('backup.restore', () => restored);
    setReminderCandidate(null);
    setLastCompletedDeadline(null);
  }, [commit]);

  const value = useMemo<BlinkContextValue>(() => ({
    data,
    ready,
    notes: [...data.notes].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    deadlines: data.deadlines,
    lastCompletedDeadline,
    activeReminder: appState === 'active' ? activeReminder : null,
    nativeNotificationPermission,
    nativeNotificationSyncing,
    nativeNotificationError,
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
    dismissActiveReminder,
    acknowledgeNativeReminder,
    setNativeNotificationsEnabled,
    reconcileNativeNotifications,
    updateSettings,
    saveMermaidVisual,
    hideVisual,
    regenerateVisual,
    backup: () => exportBackup(data),
    restore,
  }), [data, ready, appState, lastCompletedDeadline, activeReminder, nativeNotificationPermission, nativeNotificationSyncing, nativeNotificationError, saveDraft, createNote, updateNote, deleteNote, createDeadline, updateDeadline, toggleDeadline, undoLastCompletedDeadline, deleteDeadline, dismissActiveReminder, acknowledgeNativeReminder, setNativeNotificationsEnabled, reconcileNativeNotifications, updateSettings, saveMermaidVisual, hideVisual, regenerateVisual, restore]);

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

function nativeNotificationPlanKey(data: AppData): string {
  return JSON.stringify([
    data.settings.nativeNotificationsEnabled,
    data.deadlines.map(({ id, title, dueAt, reminderAt, completedAt }) => [id, title, dueAt, reminderAt, completedAt]),
  ]);
}

function debugLog(event: string, details: Record<string, unknown>) {
  if (__DEV__) {
    console.info(`[Blink save] ${event}`, details);
  }
}
