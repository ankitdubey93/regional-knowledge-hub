import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { emptyProgress, loadProgress, saveProgress, type Progress } from '../utils/progress';

interface ProgressApi {
  progress: Progress;
  /** Apply a change and persist it. The updater must return a new object. */
  update: (fn: (p: Progress) => Progress) => void;
  reset: () => void;
  persisted: boolean;
}

const ProgressContext = createContext<ProgressApi | null>(null);

export function ProgressProvider({ children }: { children: ReactNode }) {
  const [progress, setProgress] = useState<Progress>(() => loadProgress());
  const [persisted, setPersisted] = useState(true);

  useEffect(() => {
    setPersisted(saveProgress(progress));
  }, [progress]);

  const update = useCallback((fn: (p: Progress) => Progress) => setProgress((p) => fn(p)), []);
  const reset = useCallback(() => setProgress(emptyProgress()), []);

  const api = useMemo(() => ({ progress, update, reset, persisted }), [progress, update, reset, persisted]);
  return <ProgressContext.Provider value={api}>{children}</ProgressContext.Provider>;
}

export function useProgress(): ProgressApi {
  const ctx = useContext(ProgressContext);
  if (!ctx) throw new Error('useProgress must be used inside ProgressProvider');
  return ctx;
}
