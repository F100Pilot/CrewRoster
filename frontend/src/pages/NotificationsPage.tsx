import React, { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Divider,
  Chip,
  Skeleton,
  Alert,
  Button,
  IconButton,
} from '@mui/material';
import {
  Notifications as NotificationsIcon,
  NotificationsOff,
  DoneAll,
  FlightTakeoff,
  EditCalendar,
  Cancel,
  AddCircle,
  Warning,
  Info,
} from '@mui/icons-material';
import { format, parseISO } from 'date-fns';
import api from '../services/api';

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  dutyDate: string | null;
  createdAt: string;
}

const NOTIF_ICONS: Record<string, React.ReactNode> = {
  schedule_change: <EditCalendar color="warning" />,
  flight_change: <FlightTakeoff color="info" />,
  new_duty: <AddCircle color="success" />,
  cancellation: <Cancel color="error" />,
  import: <Info color="primary" />,
};

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadNotifications();
  }, []);

  async function loadNotifications() {
    try {
      const res = await api.get('/notifications');
      setNotifications(res.data.notifications || []);
    } catch (err) {
      setError('Failed to load notifications.');
    } finally {
      setLoading(false);
    }
  }

  async function markAsRead(id: string) {
    try {
      await api.put(`/notifications/${id}/read`);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
    } catch {}
  }

  async function markAllAsRead() {
    try {
      await api.put('/notifications/read-all');
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, isRead: true }))
      );
    } catch {}
  }

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <Box sx={{ p: 2 }}>
      {/* Header */}
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
        <Box display="flex" alignItems="center" gap={1}>
          <Typography variant="h5" fontWeight={700}>
            Notifications
          </Typography>
          {unreadCount > 0 && (
            <Chip
              label={unreadCount}
              color="error"
              size="small"
              sx={{ fontWeight: 700 }}
            />
          )}
        </Box>
        {unreadCount > 0 && (
          <Button
            size="small"
            startIcon={<DoneAll />}
            onClick={markAllAsRead}
          >
            Mark all read
          </Button>
        )}
      </Box>

      {loading ? (
        <Box>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} variant="rounded" height={80} sx={{ mb: 1 }} />
          ))}
        </Box>
      ) : error ? (
        <Alert severity="error">{error}</Alert>
      ) : notifications.length === 0 ? (
        <Box textAlign="center" py={6}>
          <NotificationsOff sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
          <Typography variant="h6" color="text.secondary">
            No notifications
          </Typography>
          <Typography variant="body2" color="text.disabled">
            You're all caught up!
          </Typography>
        </Box>
      ) : (
        <List disablePadding>
          {notifications.map((notif, idx) => (
            <React.Fragment key={notif.id}>
              {idx > 0 && <Divider component="li" />}
              <ListItem
                component="div"
                sx={{
                  bgcolor: notif.isRead ? 'transparent' : 'action.hover',
                  borderRadius: 1,
                  py: 1.5,
                  cursor: 'pointer',
                }}
                onClick={() => !notif.isRead && markAsRead(notif.id)}
              >
                <ListItemIcon sx={{ minWidth: 40 }}>
                  {NOTIF_ICONS[notif.type] || <NotificationsIcon color="action" />}
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Box display="flex" alignItems="center" gap={1}>
                      <Typography
                        variant="body1"
                        fontWeight={notif.isRead ? 400 : 700}
                      >
                        {notif.title}
                      </Typography>
                      {!notif.isRead && (
                        <Box
                          sx={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            bgcolor: 'primary.main',
                          }}
                        />
                      )}
                    </Box>
                  }
                  secondary={
                    <>
                      <Typography variant="body2" color="text.secondary">
                        {notif.message}
                      </Typography>
                      <Typography variant="caption" color="text.disabled">
                        {notif.dutyDate && `${notif.dutyDate} · `}
                        {format(parseISO(notif.createdAt), 'dd MMM HH:mm')}
                      </Typography>
                    </>
                  }
                  secondaryTypographyProps={{ component: 'div' }}
                />
              </ListItem>
            </React.Fragment>
          ))}
        </List>
      )}
    </Box>
  );
}
