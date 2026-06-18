import React, { useEffect, useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Skeleton,
  Alert,
  Divider,
  TextField,
  IconButton,
  Snackbar,
  Chip,
} from '@mui/material';
import {
  CalendarMonth,
  Google,
  Apple,
  ContentCopy,
  Link as LinkIcon,
  Refresh,
  CheckCircle,
  OpenInNew,
} from '@mui/icons-material';
import api from '../services/api';

interface CalendarExport {
  icsToken: string;
  icsUrl: string;
  webcalUrl: string;
  googleCalendarUrl: string;
}

export default function CalendarExportPage() {
  const [exportData, setExportData] = useState<CalendarExport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [snackbar, setSnackbar] = useState('');

  useEffect(() => {
    loadExport();
  }, []);

  async function loadExport() {
    try {
      const res = await api.get('/calendar/export');
      setExportData(res.data);
    } catch (err) {
      setError('Failed to load calendar export settings.');
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setSnackbar('Copied to clipboard!');
    } catch {
      setSnackbar('Failed to copy. Please select and copy manually.');
    }
  }

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 2 }}>
        Calendar Export
      </Typography>

      {loading ? (
        <Skeleton variant="rounded" height={400} />
      ) : error ? (
        <Alert severity="error">{error}</Alert>
      ) : exportData ? (
        <>
          {/* ICS Feed Subscription — Primary Feature */}
          <Card sx={{ mb: 2 }}>
            <CardContent sx={{ p: 3 }}>
              <Box display="flex" alignItems="center" gap={1} mb={2}>
                <CalendarMonth color="primary" />
                <Typography variant="h6" fontWeight={600}>
                  ICS Feed Subscription
                </Typography>
                <Chip label="Recommended" color="success" size="small" />
              </Box>

              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Subscribe once and your roster updates automatically in Google Calendar, Apple Calendar, Outlook, or Thunderbird.
              </Typography>

              {/* ICS URL */}
              <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                Your permanent ICS feed URL:
              </Typography>
              <TextField
                value={exportData.icsUrl}
                fullWidth
                size="small"
                InputProps={{
                  readOnly: true,
                  endAdornment: (
                    <IconButton onClick={() => handleCopy(exportData.icsUrl)}>
                      <ContentCopy />
                    </IconButton>
                  ),
                }}
                sx={{ mb: 2, '& input': { fontSize: '0.8rem', fontFamily: 'monospace' } }}
              />

              <Divider sx={{ my: 2 }} />

              {/* Platform-specific instructions */}
              <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
                Subscribe in your calendar app:
              </Typography>

              <Box display="flex" flexDirection="column" gap={1}>
                <Button
                  variant="outlined"
                  startIcon={<Google />}
                  href={exportData.googleCalendarUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  fullWidth
                >
                  Add to Google Calendar
                </Button>

                <Button
                  variant="outlined"
                  startIcon={<Apple />}
                  onClick={() => handleCopy(exportData.webcalUrl)}
                  fullWidth
                >
                  <Box component="span" sx={{ mr: 'auto' }}>
                    Subscribe in Apple Calendar
                  </Box>
                  <ContentCopy />
                </Button>

                <Button
                  variant="outlined"
                  startIcon={<CalendarMonth />}
                  onClick={() => handleCopy(exportData.icsUrl)}
                  fullWidth
                >
                  <Box component="span" sx={{ mr: 'auto' }}>
                    Copy for Outlook / Thunderbird
                  </Box>
                  <ContentCopy />
                </Button>
              </Box>
            </CardContent>
          </Card>

          {/* How it works */}
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={600} sx={{ mb: 1 }}>
                How it works
              </Typography>
              <Box component="ol" sx={{ pl: 2, m: 0 }}>
                <Typography component="li" variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  <strong>Copy your ICS feed URL</strong> — Each user has a unique, permanent URL.
                </Typography>
                <Typography component="li" variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  <strong>Subscribe in your calendar</strong> — Add the URL as a subscription in your preferred calendar app.
                </Typography>
                <Typography component="li" variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  <strong>Automatic updates</strong> — When you import a new roster, events are updated everywhere.
                </Typography>
              </Box>

              <Alert severity="info" sx={{ mt: 2 }}>
                <Typography variant="body2">
                  <strong>Compatible with:</strong> Google Calendar, Apple Calendar, Microsoft Outlook, Mozilla Thunderbird, and any calendar app that supports iCalendar (.ics) subscriptions.
                </Typography>
              </Alert>
            </CardContent>
          </Card>
        </>
      ) : null}

      <Snackbar
        open={!!snackbar}
        autoHideDuration={3000}
        onClose={() => setSnackbar('')}
        message={snackbar}
      />
    </Box>
  );
}
