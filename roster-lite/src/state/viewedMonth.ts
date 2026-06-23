import { useEffect, useState } from 'react';

// The month currently being browsed, shared across the list and calendar (and remembered
// when returning from a day detail). Module-level so it survives the unmount/remount that
// route changes cause — both pages read it on mount, so they stay in sync.
let lastViewedMonth: Date | null = null;

export function useViewedMonth() {
  const [month, setMonth] = useState<Date>(() => lastViewedMonth ?? new Date());
  useEffect(() => { lastViewedMonth = month; }, [month]);
  return [month, setMonth] as const;
}
