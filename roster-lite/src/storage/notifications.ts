// Persistent store for CrewLink notifications the user has confirmed. Kept in
// localStorage per user. When a roster-blocking notification is confirmed during a
// download, its text is saved here and shown as a dismissible banner at the top of
// the app until the user clears it — so a confirmed change isn't silently lost.

export interface CrewNotification {
  id: string;
  text: string;
  confirmedAt: string;
}

const key = (userId: string) => `crewlink_notifications_${userId}`;

// localStorage isn't reactive; components listen for this event to refresh.
export const NOTIFICATIONS_EVENT = 'crewlink-notifications-changed';

export function listNotifications(userId: string): CrewNotification[] {
  try {
    return JSON.parse(localStorage.getItem(key(userId)) || '[]') as CrewNotification[];
  } catch {
    return [];
  }
}

export function addNotification(userId: string, text: string): void {
  const list = listNotifications(userId);
  list.unshift({ id: crypto.randomUUID(), text, confirmedAt: new Date().toISOString() });
  localStorage.setItem(key(userId), JSON.stringify(list));
  window.dispatchEvent(new CustomEvent(NOTIFICATIONS_EVENT));
}

export function dismissNotification(userId: string, id: string): void {
  const list = listNotifications(userId).filter((n) => n.id !== id);
  localStorage.setItem(key(userId), JSON.stringify(list));
  window.dispatchEvent(new CustomEvent(NOTIFICATIONS_EVENT));
}

// Remove all confirmed notifications for a user (used when a profile is deleted).
export function clearNotifications(userId: string): void {
  localStorage.removeItem(key(userId));
  window.dispatchEvent(new CustomEvent(NOTIFICATIONS_EVENT));
}
