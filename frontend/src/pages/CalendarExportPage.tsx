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
  Snackbar,
  Chip,
} from '@mui/material';
import {
  CalendarMonth,
  Google,
  Apple,
  ContentCopy,
  Download,
  OpenInNew,
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { exportCalendarToken, fetchMonthlyRoster, DutyData } from '../lib/firebase/db';

// Generate ICS file content from duties
function generateICS(duties: DutyData[], crewName: string): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CrewRoster//PT',
    `X-WR-CALNAME:CrewRoster - ${crewName}`,
    'X-WR-CALDESC:Crew roster schedule',
  ];

  duties.forEach((duty) => {
    if (duty.dutyCode === 'OFF' || duty.dutyType === 'Day Off') return;

    const dt = new Date(duty.date + 'T00:00:00Z');
    const dateStr = `${dt.getUTCFullYear()}${String(dt.getUTCMonth() + 1).padStart(2, '0')}${String(dt.getUTCDate()).padStart(2, '0')}`;
    const summary = duty.flight
      ? `${duty.dutyCode} ${duty.flight.flightNumber} ${duty.flight.departureAirport}-${duty.flight.arrivalAirport}`
      : `${duty.dutyCode} ${duty.dutyType}`;

    lines.push(
      'BEGIN:VEVENT',
      `DTSTART;VALUE=DATE:${dateStr}`,
      `DTEND;VALUE=DATE:${dateStr}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${duty.dutyType}${duty.reportingTime ? `\\nReport: ${duty.reportingTime}` : ''}`,
      'END:VEVENT'
    );
  });

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export default function CalendarExportPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [snackbar, setSnackbar] = useState('');

  useEffect(() => {
    // Just trigger token creation
    if (user) {
      exportCalendarToken(user.uid).catch(console.error);
      setLoading(false);
    }
  }, [user]);

  async function handleExportICS() {
    if (!user) return;
    try {
      const now = new Date();
      const duties = await fetchMonthlyRoster(user.uid, now.getFullYear(), now.getMonth() + 1);
      const icsContent = generateICS(duties, user.fullName);

      const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `crewroster-${user.crewCode}-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}.ics`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setSnackbar('ICS file downloaded! Import it into your calendar app.');
    } catch (err) {
      setSnackbar('Failed to generate ICS file.');
    }
  }

  async function handleCopy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setSnackbar('Copied to clipboard!');
    } catch {
      setSnackbar('Failed to copy.');
    }
  }

  const googleCalUrl = 'https://calendar.google.com/calendar/r/settings/addbyurl';

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 2 }}>Calendar Export</Typography>

      {loading ? (
        <Skeleton variant="rounded" height={400} />
      ) : error ? (
        <Alert severity="error">{error}</Alert>
      ) : (
        <>
          <Card sx={{ mb: 2 }}>
            <CardContent sx={{ p: 3 }}>
              <Box display="flex" alignItems="center" gap={1} mb={2}>
                <CalendarMonth color="primary" />
                <Typography variant="h6" fontWeight={600}>Export Roster to Calendar</Typography>
              </Box>

              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Download your roster as an ICS file and import it into Google Calendar, Apple Calendar, Outlook, or any calendar app.
              </Typography>

              <Button variant="contained" size="large" startIcon={<Download />} onClick={handleExportICS} fullWidth sx={{ mb: 2 }}>
                Download ICS File (This Month)
              </Button>

              <Divider sx={{ my: 2 }} />

              <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
                How to import:
              </Typography>

              <Box display="flex" flexDirection="column" gap={1}>
                <Button variant="outlined" startIcon={<Google />} onClick={() => { handleCopy(googleCalUrl); window.open(googleCalUrl, '_blank'); }} fullWidth>
                  <Box component="span" sx={{ mr: 'auto' }}>Open Google Calendar Import</Box>
                  <OpenInNew />
                </Button>
                <Typography variant="caption" color="text.secondary" sx={{ mb: 1 }}>
                  1. Download the ICS file above<br />
                  2. Go to Google Calendar → Settings → Import & Export<br />
                  3. Select the downloaded .ics file and import
                </Typography>

                <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
                  <strong>Apple Calendar / Outlook:</strong> Download the ICS file, then double-click it to import automatically.
                </Typography>
              </Box>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={600} sx={{ mb: 1 }}>Important</Typography>
              <Typography variant="body2" color="text.secondary">
                Since CrewRoster runs completely on the free Firebase plan (no server), ICS subscription URLs are not available.
                Instead, <strong>download the ICS file</strong> each month after you import your roster, and re-import it into your calendar.
                Your calendar will update with any changes when you import a new file.
              </Typography>
            </CardContent>
          </Card>
        </>
      )}

      <Snackbar open={!!snackbar} autoHideDuration={4000} onClose={() => setSnackbar('')} message={snackbar} />
    </Box>
  );
}
