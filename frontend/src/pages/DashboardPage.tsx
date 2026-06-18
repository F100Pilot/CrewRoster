import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Chip,
  Skeleton,
  Alert,
  IconButton,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
} from '@mui/material';
import {
  FlightTakeoff,
  AccessTime,
  CalendarToday,
  Timeline,
  NotificationsActive,
  ChevronRight,
  Schedule,
  AirplanemodeActive,
  Update,
} from '@mui/icons-material';
import { format, parseISO } from 'date-fns';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';

interface NextDuty {
  id: string;
  date: string;
  dutyCode: string;
  dutyType: string;
  reportingTime: string;
  departureTime: string | null;
  flight: {
    flightNumber: string;
    departureAirport: string;
    arrivalAirport: string;
  } | null;
}

interface Stats {
  blockHours: number;
  sectorCount: number;
  offDaysRemaining: number;
}

interface Change {
  id: string;
  date: string;
  dutyCode: string;
  dutyType: string;
  modifiedAt: string;
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [nextDuty, setNextDuty] = useState<NextDuty | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [changes, setChanges] = useState<Change[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadDashboard() {
      try {
        const [dutyRes, statsRes, changesRes] = await Promise.all([
          api.get('/roster/next'),
          api.get('/roster/stats'),
          api.get('/roster/changes'),
        ]);
        setNextDuty(dutyRes.data.duty);
        setStats(statsRes.data);
        setChanges(changesRes.data.changes || []);
      } catch (err) {
        setError('Failed to load dashboard data.');
      } finally {
        setLoading(false);
      }
    }
    loadDashboard();
  }, []);

  const dutyTypeColor = (type: string): 'primary' | 'success' | 'warning' | 'info' | 'default' => {
    switch (type) {
      case 'Flight Duty': return 'primary';
      case 'Standby Airport': return 'warning';
      case 'Day Off': return 'success';
      case 'Vacation': return 'success';
      default: return 'default';
    }
  };

  return (
    <Box sx={{ p: 2, pb: 2 }}>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>
          Hello, {user?.fullName?.split(' ')[0] || 'Crew'}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {user?.base} • {user?.role}
        </Typography>
      </Box>

      {/* Next Duty Card */}
      <Card sx={{ mb: 2, background: 'linear-gradient(135deg, #1a237e 0%, #283593 100%)', color: 'white' }}>
        <CardContent sx={{ p: 2.5 }}>
          <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
            <Typography variant="overline" sx={{ opacity: 0.8 }}>
              Next Duty
            </Typography>
            <IconButton size="small" sx={{ color: 'white' }} onClick={() => navigate('/roster')}>
              <ChevronRight />
            </IconButton>
          </Box>

          {loading ? (
            <Skeleton variant="text" height={40} sx={{ bgcolor: 'rgba(255,255,255,0.2)' }} />
          ) : nextDuty ? (
            <>
              <Box display="flex" alignItems="center" gap={1} mb={0.5}>
                <FlightTakeoff />
                <Typography variant="h6" fontWeight={700}>
                  {nextDuty.flight ? `${nextDuty.flight.flightNumber} ` : ''}
                  {nextDuty.flight
                    ? `${nextDuty.flight.departureAirport} → ${nextDuty.flight.arrivalAirport}`
                    : nextDuty.dutyType}
                </Typography>
              </Box>
              <Box display="flex" gap={2} flexWrap="wrap">
                <Box display="flex" alignItems="center" gap={0.5}>
                  <CalendarToday sx={{ fontSize: 16 }} />
                  <Typography variant="body2">
                    {format(parseISO(nextDuty.date), 'EEE dd MMM')}
                  </Typography>
                </Box>
                {nextDuty.reportingTime && (
                  <Box display="flex" alignItems="center" gap={0.5}>
                    <AccessTime sx={{ fontSize: 16 }} />
                    <Typography variant="body2">
                      Report {nextDuty.reportingTime.substring(0, 5)}
                    </Typography>
                  </Box>
                )}
              </Box>
              <Chip
                label={nextDuty.dutyCode}
                size="small"
                color={dutyTypeColor(nextDuty.dutyType)}
                sx={{ mt: 1, fontWeight: 600 }}
              />
            </>
          ) : (
            <Box display="flex" alignItems="center" gap={1}>
              <Schedule />
              <Typography>No upcoming duties scheduled</Typography>
            </Box>
          )}
        </CardContent>
      </Card>

      {/* Stats Grid */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={4}>
          <Card>
            <CardContent sx={{ textAlign: 'center', py: 2, '&:last-child': { pb: 2 } }}>
              <Timeline sx={{ color: 'primary.main', mb: 0.5 }} />
              {loading ? (
                <Skeleton variant="text" width={40} sx={{ mx: 'auto' }} />
              ) : (
                <Typography variant="h5" fontWeight={700}>
                  {stats?.blockHours || 0}h
                </Typography>
              )}
              <Typography variant="caption" color="text.secondary">
                Block Hours
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={4}>
          <Card>
            <CardContent sx={{ textAlign: 'center', py: 2, '&:last-child': { pb: 2 } }}>
              <AirplanemodeActive sx={{ color: 'secondary.main', mb: 0.5 }} />
              {loading ? (
                <Skeleton variant="text" width={40} sx={{ mx: 'auto' }} />
              ) : (
                <Typography variant="h5" fontWeight={700}>
                  {stats?.sectorCount || 0}
                </Typography>
              )}
              <Typography variant="caption" color="text.secondary">
                Sectors
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={4}>
          <Card>
            <CardContent sx={{ textAlign: 'center', py: 2, '&:last-child': { pb: 2 } }}>
              <CalendarToday sx={{ color: 'success.main', mb: 0.5 }} />
              {loading ? (
                <Skeleton variant="text" width={40} sx={{ mx: 'auto' }} />
              ) : (
                <Typography variant="h5" fontWeight={700}>
                  {stats?.offDaysRemaining || 0}
                </Typography>
              )}
              <Typography variant="caption" color="text.secondary">
                OFF Days
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Recent Changes */}
      <Typography variant="h6" fontWeight={600} sx={{ mb: 1 }}>
        <Update sx={{ mr: 0.5, verticalAlign: 'middle', fontSize: 20 }} />
        Recent Changes
      </Typography>

      {changes.length > 0 ? (
        <Card>
          <List disablePadding>
            {changes.slice(0, 5).map((change, idx) => (
              <React.Fragment key={change.id}>
                {idx > 0 && <Divider component="li" />}
                <ListItem
                  component="div"
                  sx={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/roster/${change.date}`)}
                >
                  <ListItemIcon>
                    <NotificationsActive color="warning" />
                  </ListItemIcon>
                  <ListItemText
                    primary={change.dutyCode}
                    secondary={`${format(parseISO(change.date), 'dd MMM yyyy')} - Modified ${format(parseISO(change.modifiedAt), 'dd MMM HH:mm')}`}
                    primaryTypographyProps={{ fontWeight: 600, fontSize: 14 }}
                    secondaryTypographyProps={{ fontSize: 12 }}
                  />
                  <ChevronRight />
                </ListItem>
              </React.Fragment>
            ))}
          </List>
        </Card>
      ) : !loading && (
        <Alert severity="info" sx={{ mt: 1 }}>
          No recent changes to your roster.
        </Alert>
      )}

      {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
    </Box>
  );
}
