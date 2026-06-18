import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Roster } from '../domain/types';
import { parseRosterFile } from '../parsing';
import { clearRoster, loadRoster, saveRoster } from '../storage/rosterStore';
import { RosterContext, type RosterState } from './useRoster';

export function RosterProvider({ children }: { children: ReactNode }) {
  const [roster, setRoster] = useState<Roster | null>(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  // Hydrate from IndexedDB on first load so the user never re-uploads.
  useEffect(() => {
    loadRoster()
      .then((r) => setRoster(r ?? null))
      .catch(() => setRoster(null))
      .finally(() => setLoading(false));
  }, []);

  const importFile = useCallback(async (file: File) => {
    setImporting(true);
    setError(null);
    setWarnings([]);
    try {
      const result = await parseRosterFile(file);
      const next: Roster = {
        id: 'current',
        fileName: file.name,
        sourceType: result.sourceType,
        importedAt: new Date().toISOString(),
        duties: result.duties,
        rawText: result.rawText,
      };
      await saveRoster(next);
      setRoster(next);
      setWarnings(result.warnings);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao ler o ficheiro.');
    } finally {
      setImporting(false);
    }
  }, []);

  const clear = useCallback(async () => {
    await clearRoster();
    setRoster(null);
    setWarnings([]);
    setError(null);
  }, []);

  const value = useMemo<RosterState>(
    () => ({ roster, loading, importing, error, warnings, importFile, clear }),
    [roster, loading, importing, error, warnings, importFile, clear]
  );

  return <RosterContext.Provider value={value}>{children}</RosterContext.Provider>;
}
