import type { CrewDocument } from './types';

// Documents (medical, licence, OPC/LPC, passport…) that need attention soon, for a heads-up line on
// the roster page — the Documents page only helps if one remembers to open it. Expired or within
// DOC_ALERT_DAYS; red once expired or within 30 days (the same thresholds as the Documents page's
// chips), amber otherwise.
export const DOC_ALERT_DAYS = 60;

export interface DocAlert {
  doc: CrewDocument;
  days: number; // days until expiry; negative once expired
  level: 'error' | 'warning';
}

const dayNumber = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86400000);

// Soonest first.
export function documentAlerts(docs: CrewDocument[], todayISO: string): DocAlert[] {
  return docs
    .map((doc) => ({ doc, days: dayNumber(doc.expiry) - dayNumber(todayISO) }))
    .filter((a) => a.days <= DOC_ALERT_DAYS)
    .map((a) => ({ ...a, level: (a.days <= 30 ? 'error' : 'warning') as DocAlert['level'] }))
    .sort((a, b) => a.days - b.days);
}

// "Medical expira em 23 dias" / "… expira amanhã" / "… expirou há 3 dias".
export function describeAlert(a: DocAlert): string {
  const n = a.doc.name;
  if (a.days < -1) return `${n} expirou há ${-a.days} dias`;
  if (a.days === -1) return `${n} expirou ontem`;
  if (a.days === 0) return `${n} expira hoje`;
  if (a.days === 1) return `${n} expira amanhã`;
  return `${n} expira em ${a.days} dias`;
}
