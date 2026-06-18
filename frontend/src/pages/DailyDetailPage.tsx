import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Chip,
  Skeleton,
  Alert,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemText,
} from '@mui/material';
import {
  ArrowBack,
  FlightTakeoff,
  FlightLand,
  AccessTime,
  Schedule,
  Timer,
  Info,
  AirplanemodeActive,
  EditCalendar,
  WbSunny,
} from '@mui/icons-material';
import { format, parseISO } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';
import { fetchDailyRoster, DutyData } from '../lib/firebase/db';

const DUTY_COLORS: Record<string, string> = {
  'Flight Duty': '#1976d2',
  'Standby Airport': '#f57c00',
  'Standby Home': '#ff9800',
  'Office Duty': '#7b1fa2',
  Simulator: '#00838f',
  Training: '#2e7d32',
  Medical: '#c62828',
  Vacation: '#00c853',
  'Day Off': '#9e9e9e',
  Reserve: '#5c6bc0',
  Positioning: '#546e7a',
};

function formatInterval(hours: number): string {
  if (hours <= 0) return '-';
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

export default function DailyDetailPage() {
  const { date } = useParams<{ date: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [duties, setDuties] = useState<DutyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!date || !user) return;
    async function load() {
      try {
        const result = await fetchDailyRoster(user!.uid, date!);
        setDuties(result);
      } catch (err) {
        setError('Failed to load duty details.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [date, user]);

  const displayDate = date ? format(parseISO(date), 'EEEE, dd MMMM yyyy') : '';

  return (
    <Box sx={{ p: 2 }}>
      <Box display="flex" alignItems="center" gap={1} mb={2}>
        <IconButton onClick={() => navigate('/roster')}><ArrowBack /></IconButton>
        <Typography variant="h6" fontWeight={600}>{loading ? <Skeleton width={200} /> : displayDate}</Typography>
      </Box>

      {loading ? (
        <Box>{[1, 2].map((i) => (<Skeleton key={i} variant="rounded" height={200} sx={{ mb: 2 }} />))}</Box>
      ) : error ? (
        <Alert severity="error">{error}</Alert>
      ) : duties.length === 0 ? (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 6 }}>
            <WbSunny sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
            <Typography variant="h6" color="text.secondary">No duties scheduled</Typography>
            <Typography variant="body2" color="text.disabled">You have the day off</Typography>
          </CardContent>
        </Card>
      ) : (
        duties.map((duty) => (
          <Card key={duty.id} sx={{ mb: 2 }}>
            <CardContent sx={{ p: 2.5 }}>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                <Chip label={duty.dutyCode} sx={{ bgcolor: DUTY_COLORS[duty.dutyType] || '#9e9e9e', color: duty.dutyType === 'Day Off' ? 'text.primary' : '#fff', fontWeight: 700 }} />
                <Chip label={duty.dutyType} variant="outlined" size="small" />
                {duty.isModified && <Chip icon={<EditCalendar />} label="Modified" color="warning" size="small" variant="outlined" />}
              </Box>

              {duty.flight && (
                <Box sx={{ bgcolor: 'grey.50', borderRadius: 2, p: 2, mb: 2 }}>
                  <Box display="flex" alignItems="center" justifyContent="space-between">
                    <Box textAlign="center">
                      <Typography variant="caption" color="text.secondary">Flight</Typography>
                      <Typography variant="h6" fontWeight={700}>{duty.flight.flightNumber}</Typography>
                    </Box>
                    <Box textAlign="center">
                      <Typography variant="caption" color="text.secondary">Aircraft</Typography>
                      <Typography variant="body1" fontWeight={600}>{duty.flight.aircraftType || '-'}</Typography>
                    </Box>
                  </Box>
                  <Box display="flex" alignItems="center" justifyContent="center" gap={2} my={2}>
                    <Box textAlign="center">
                      <Typography variant="h5" fontWeight={700}>{duty.flight.departureAirport}</Typography>
                      <Typography variant="caption" color="text.secondary">{duty.departureTime ? format(parseISO(duty.departureTime), 'HH:mm') : '-'}</Typography>
                    </Box>
                    <Box>
                      <FlightTakeoff sx={{ color: 'primary.main', mx: 1 }} />
                      <Box sx={{ width: 40, height: 2, bgcolor: 'primary.main' }} />
                      <FlightLand sx={{ color: 'primary.main', mx: 1 }} />
                    </Box>
                    <Box textAlign="center">
                      <Typography variant="h5" fontWeight={700}>{duty.flight.arrivalAirport}</Typography>
                      <Typography variant="caption" color="text.secondary">{duty.arrivalTime ? format(parseISO(duty.arrivalTime), 'HH:mm') : '-'}</Typography>
                    </Box>
                  </Box>
                </Box>
              )}

              <List dense disablePadding>
                {duty.reportingTime && (
                  <ListItem disableGutters>
                    <AccessTime sx={{ mr: 1, color: 'text.secondary', fontSize: 20 }} />
                    <ListItemText primary="Reporting Time" secondary={duty.reportingTime.substring(0, 5)}
                      primaryTypographyProps={{ variant: 'caption', color: 'text.secondary' }}
                      secondaryTypographyProps={{ variant: 'body1', fontWeight: 600 }} />
                  </ListItem>
                )}
                {duty.departureTime && (
                  <ListItem disableGutters>
                    <Schedule sx={{ mr: 1, color: 'text.secondary', fontSize: 20 }} />
                    <ListItemText primary="Departure (STD)" secondary={format(parseISO(duty.departureTime), 'HH:mm')}
                      primaryTypographyProps={{ variant: 'caption', color: 'text.secondary' }}
                      secondaryTypographyProps={{ variant: 'body1', fontWeight: 600 }} />
                  </ListItem>
                )}
                {duty.arrivalTime && (
                  <ListItem disableGutters>
                    <Timer sx={{ mr: 1, color: 'text.secondary', fontSize: 20 }} />
                    <ListItemText primary="Arrival (STA)" secondary={format(parseISO(duty.arrivalTime), 'HH:mm')}
                      primaryTypographyProps={{ variant: 'caption', color: 'text.secondary' }}
                      secondaryTypographyProps={{ variant: 'body1', fontWeight: 600 }} />
                  </ListItem>
                )}
                {duty.blockTime > 0 && (
                  <ListItem disableGutters>
                    <AirplanemodeActive sx={{ mr: 1, color: 'text.secondary', fontSize: 20 }} />
                    <ListItemText primary="Block Time" secondary={formatInterval(duty.blockTime)}
                      primaryTypographyProps={{ variant: 'caption', color: 'text.secondary' }}
                      secondaryTypographyProps={{ variant: 'body1', fontWeight: 600 }} />
                  </ListItem>
                )}
              </List>

              {duty.observations && (
                <>
                  <Divider sx={{ my: 1.5 }} />
                  <Box display="flex" alignItems="flex-start" gap={1}>
                    <Info sx={{ color: 'text.secondary', fontSize: 20, mt: 0.2 }} />
                    <Typography variant="body2" color="text.secondary">{duty.observations}</Typography>
                  </Box>
                </>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </Box>
  );
}
