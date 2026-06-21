import { useEffect, useState } from 'react';
import { Alert, AlertTitle, Stack } from '@mui/material';
import { NotificationsActive } from '@mui/icons-material';
import { useRoster } from '../state/useRoster';
import {
  listNotifications, dismissNotification, NOTIFICATIONS_EVENT,
  type CrewNotification,
} from '../storage/notifications';

// Shows confirmed CrewLink notifications as dismissible banners at the top of the
// app. Each stays until the user closes it.
export default function NotificationBanner() {
  const { activeUser } = useRoster();
  const [items, setItems] = useState<CrewNotification[]>([]);

  useEffect(() => {
    if (!activeUser) {
      setItems([]);
      return;
    }
    const refresh = () => setItems(listNotifications(activeUser.id));
    refresh();
    window.addEventListener(NOTIFICATIONS_EVENT, refresh);
    return () => window.removeEventListener(NOTIFICATIONS_EVENT, refresh);
  }, [activeUser]);

  if (!activeUser || items.length === 0) return null;

  return (
    <Stack spacing={1} mb={2}>
      {items.map((n) => (
        <Alert
          key={n.id}
          severity="info"
          icon={<NotificationsActive fontSize="inherit" />}
          onClose={() => dismissNotification(activeUser.id, n.id)}
        >
          <AlertTitle>Notificação CrewLink confirmada</AlertTitle>
          <span style={{ whiteSpace: 'pre-wrap' }}>{n.text}</span>
        </Alert>
      ))}
    </Stack>
  );
}
