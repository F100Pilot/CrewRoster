import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  IconButton,
  Chip,
  Skeleton,
  Alert,
  Grid,
  Paper,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  CircularProgress,
  Snackbar,
} from '@mui/material';
import {
  ChevronLeft,
  ChevronRight,
  Today,
  UploadFile,
  FlightTakeoff,
  Home,
  AirplanemodeActive,
  Computer,
  School,
  LocalHospital,
  BeachAccess,
  WbSunny,
  Shield,
  DirectionsWalk,
} from '@mui/icons-material';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  addMonths,
  subMonths,
  isSameMonth,
  isToday,
  parseISO,
  isSameDay,
} from 'date-fns';
import api from '../services/api';

interface Duty {
  id: string;
  dutyCode: string;
  dutyType: string;
  reportingTime: string | null;
  flight: {
    flightNumber: string;
    departureAirport: string;
    arrivalAirport: string;
  } | null;
}

interface DutiesMap {
  [date: string]: Duty[];
}

const DUTY_COLORS: Record<string, string> = {
  'Flight Duty': '#1976d2',
  'Standby Airport': '#f57c00',
  'Standby Home': '#ff9800',
  'Office Duty': '#7b1fa2',
  'Simulator': '#00838f',
  'Training': '#2e7d32',
  'Medical': '#c62828',
  'Vacation': '#00c853',
  'Day Off': '#e0e0e0',
  'Reserve': '#5c6bc0',
  'Positioning': '#546e7a',
};

const DUTY_ICONS: Record<string, React.ReactElement> = {
  'Flight Duty': <FlightTakeoff sx={{ fontSize: 12 }} />,
  'Standby Airport': <AirplanemodeActive sx={{ fontSize: 12 }} />,
  'Standby Home': <Home sx={{ fontSize: 12 }} />,
  'Office Duty': <Computer sx={{ fontSize: 12 }} />,
  'Simulator': <School sx={{ fontSize: 12 }} />,
  'Training': <School sx={{ fontSize: 12 }} />,
  'Medical': <LocalHospital sx={{ fontSize: 12 }} />,
  'Vacation': <BeachAccess sx={{ fontSize: 12 }} />,
  'Day Off': <WbSunny sx={{ fontSize: 12 }} />,
  'Reserve': <Shield sx={{ fontSize: 12 }} />,
  'Positioning': <DirectionsWalk sx={{ fontSize: 12 }} />,
};

export default function MonthlyRosterPage() {
  const navigate = useNavigate();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [duties, setDuties] = useState<DutiesMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [snackbar, setSnackbar] = useState('');

  const month = currentMonth.getMonth() + 1;
  const year = currentMonth.getFullYear();

  const loadDuties = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/roster/${year}/${month}`);
      setDuties(res.data.days || {});
    } catch (err) {
      setError('Failed to load roster data.');
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    loadDuties();
  }, [loadDuties]);

  const days = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth),
  });

  const startPadding = getDay(startOfMonth(currentMonth)) === 0 ? 6 : getDay(startOfMonth(currentMonth)) - 1;

  const handleImport = async () => {
    if (!importFile) return;
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', importFile);
      formData.append('month', month.toString());
      formData.append('year', year.toString());

      const res = await api.post('/import/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setSnackbar(res.data.message);
      setImportDialogOpen(false);
      setImportFile(null);
      loadDuties();
    } catch (err: any) {
      setSnackbar(err.response?.data?.error || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  return (
    <Box sx={{ p: 2 }}>
      {/* Header */}
      <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
        <Box display="flex" alignItems="center" gap={1}>
          <IconButton onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
            <ChevronLeft />
          </IconButton>
          <Typography variant="h6" fontWeight={600}>
            {format(currentMonth, 'MMMM yyyy')}
          </Typography>
          <IconButton onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
            <ChevronRight />
          </IconButton>
        </Box>
        <Box display="flex" gap={0.5}>
          <IconButton onClick={() => setCurrentMonth(new Date())} color="primary">
            <Today />
          </IconButton>
          <Button
            variant="outlined"
            size="small"
            startIcon={<UploadFile />}
            onClick={() => setImportDialogOpen(true)}
          >
            Import
          </Button>
        </Box>
      </Box>

      {/* Day headers */}
      <Grid container spacing={0.5} sx={{ mb: 0.5 }}>
        {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map((d) => (
          <Grid item xs={12 / 7} key={d}>
            <Typography variant="caption" fontWeight={600} textAlign="center" display="block" color="text.secondary">
              {d}
            </Typography>
          </Grid>
        ))}
      </Grid>

      {/* Calendar grid */}
      <Grid container spacing={0.5}>
        {/* Padding days */}
        {Array.from({ length: startPadding }).map((_, i) => (
          <Grid item xs={12 / 7} key={`pad-${i}`}>
            <Paper sx={{ aspectRatio: '1', opacity: 0.3, borderRadius: 1 }} />
          </Grid>
        ))}

        {days.map((day) => {
          const dateKey = format(day, 'yyyy-MM-dd');
          const dayDuties = duties[dateKey] || [];
          const todayFlag = isToday(day);

          return (
            <Grid item xs={12 / 7} key={dateKey}>
              <Paper
                sx={{
                  aspectRatio: '1',
                  p: 0.5,
                  cursor: 'pointer',
                  borderRadius: 1,
                  bgcolor: todayFlag ? '#e3f2fd' : 'background.paper',
                  border: todayFlag ? '2px solid #1a237e' : '1px solid',
                  borderColor: todayFlag ? 'primary.main' : 'divider',
                  overflow: 'hidden',
                  '&:hover': { bgcolor: 'action.hover' },
                }}
                onClick={() => navigate(`/roster/${dateKey}`)}
              >
                <Typography
                  variant="caption"
                  fontWeight={todayFlag ? 700 : 500}
                  color={!isSameMonth(day, currentMonth) ? 'text.disabled' : todayFlag ? 'primary' : 'text.primary'}
                >
                  {format(day, 'd')}
                </Typography>

                <Box sx={{ mt: 0.2 }}>
                  {dayDuties.slice(0, 2).map((duty) => (
                    <Box key={duty.id} sx={{ mb: 0.2 }}>
                      <Chip
                        icon={DUTY_ICONS[duty.dutyType] || undefined}
                        label={
                          <Box component="span" sx={{ fontSize: '0.6rem', lineHeight: 1 }}>
                            {duty.flight ? duty.flight.flightNumber : duty.dutyCode}
                            {duty.flight && (
                              <Box component="span" sx={{ fontSize: '0.5rem', display: 'block' }}>
                                {duty.flight.departureAirport}-{duty.flight.arrivalAirport}
                              </Box>
                            )}
                            {duty.reportingTime && (
                              <Box component="span" sx={{ fontSize: '0.5rem' }}>
                                {duty.reportingTime.substring(0, 5)}
                              </Box>
                            )}
                          </Box>
                        }
                        size="small"
                        sx={{
                          height: 'auto',
                          minHeight: 16,
                          fontSize: '0.6rem',
                          bgcolor: DUTY_COLORS[duty.dutyType] || '#9e9e9e',
                          color: duty.dutyType === 'Day Off' ? 'text.primary' : '#fff',
                          width: '100%',
                          '& .MuiChip-label': { px: 0.5, py: 0 },
                          '& .MuiChip-icon': { ml: 0.3, mr: -0.3 },
                        }}
                      />
                    </Box>
                  ))}
                  {dayDuties.length > 2 && (
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.55rem' }}>
                      +{dayDuties.length - 2} more
                    </Typography>
                  )}
                </Box>
              </Paper>
            </Grid>
          );
        })}
      </Grid>

      {/* Legend */}
      <Box sx={{ mt: 2, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
        {Object.entries(DUTY_COLORS).map(([type, color]) => (
          <Chip
            key={type}
            label={type}
            size="small"
            sx={{
              bgcolor: type === 'Day Off' ? '#e0e0e0' : color,
              color: type === 'Day Off' ? 'text.primary' : '#fff',
              fontSize: '0.65rem',
              height: 22,
            }}
          />
        ))}
      </Box>

      {loading && (
        <Box sx={{ mt: 2 }}>
          <Skeleton variant="rounded" height={400} />
        </Box>
      )}

      {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}

      {/* Import Dialog */}
      <Dialog open={importDialogOpen} onClose={() => setImportDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Import Roster</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Upload a CSV or ICS file exported from NetLine CrewLink to import your roster.
          </Typography>
          <TextField
            type="file"
            fullWidth
            inputProps={{ accept: '.csv,.ics' }}
            onChange={(e) => {
              const files = (e.target as HTMLInputElement).files;
              if (files && files.length > 0) setImportFile(files[0]);
            }}
            sx={{ mb: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setImportDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleImport}
            disabled={!importFile || importing}
          >
            {importing ? <CircularProgress size={20} /> : 'Import'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={!!snackbar}
        autoHideDuration={4000}
        onClose={() => setSnackbar('')}
        message={snackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  );
}
