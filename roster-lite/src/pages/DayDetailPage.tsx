import { Box, Card, CardContent, Chip, Divider, IconButton, Stack, Typography } from '@mui/material';
import { ArrowBack, FlightLand, FlightTakeoff } from '@mui/icons-material';
import { format, parseISO } from 'date-fns';
import { useNavigate, useParams } from 'react-router-dom';
import { useRoster } from '../state/useRoster';
import { dutyColor } from '../theme';

export default function DayDetailPage() {
  const { date } = useParams<{ date: string }>();
  const navigate = useNavigate();
  const { roster } = useRoster();

  const duties = (roster?.duties ?? []).filter((d) => d.date === date);

  return (
    <Stack spacing={2}>
      <Box display="flex" alignItems="center" gap={1}>
        <IconButton onClick={() => navigate(-1)}>
          <ArrowBack />
        </IconButton>
        <Typography variant="h6">{date ? format(parseISO(date), 'EEEE, dd MMMM yyyy') : ''}</Typography>
      </Box>

      {duties.length === 0 && <Typography color="text.secondary">Sem registos neste dia.</Typography>}

      {duties.map((duty, i) => (
        <Card key={i} variant="outlined">
          <CardContent>
            <Box display="flex" alignItems="center" gap={1} mb={2}>
              <Chip
                label={duty.dutyCode}
                sx={{
                  bgcolor: dutyColor(duty.dutyType),
                  color: duty.dutyType === 'Day Off' ? 'text.primary' : '#fff',
                  fontWeight: 700,
                }}
              />
              <Chip label={duty.dutyType} variant="outlined" size="small" />
            </Box>

            {duty.flightNumber && (
              <Box sx={{ bgcolor: 'grey.50', borderRadius: 2, p: 2, mb: 2 }}>
                <Box textAlign="center" mb={1}>
                  <Typography variant="caption" color="text.secondary">
                    Voo
                  </Typography>
                  <Typography variant="h6" fontWeight={700}>
                    {duty.flightNumber}
                  </Typography>
                </Box>
                <Box display="flex" alignItems="center" justifyContent="center" gap={2}>
                  <Box textAlign="center">
                    <Typography variant="h5" fontWeight={700}>
                      {duty.departureAirport || '—'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {duty.departureTime?.slice(11, 16) || duty.reportingTime || '—'}
                    </Typography>
                  </Box>
                  <Box display="flex" alignItems="center">
                    <FlightTakeoff sx={{ color: 'primary.main' }} />
                    <Box sx={{ width: 32, height: 2, bgcolor: 'primary.main', mx: 0.5 }} />
                    <FlightLand sx={{ color: 'primary.main' }} />
                  </Box>
                  <Box textAlign="center">
                    <Typography variant="h5" fontWeight={700}>
                      {duty.arrivalAirport || '—'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {duty.arrivalTime?.slice(11, 16) || '—'}
                    </Typography>
                  </Box>
                </Box>
                {duty.aircraftType && (
                  <Typography variant="caption" color="text.secondary" display="block" textAlign="center" mt={1}>
                    {duty.aircraftType}
                  </Typography>
                )}
              </Box>
            )}

            <Stack spacing={0.5}>
              {duty.reportingTime && <Detail label="Report" value={duty.reportingTime} />}
              {duty.departureTime && <Detail label="STD" value={duty.departureTime.slice(11, 16) || duty.departureTime} />}
              {duty.arrivalTime && <Detail label="STA" value={duty.arrivalTime.slice(11, 16) || duty.arrivalTime} />}
            </Stack>

            {duty.observations && (
              <>
                <Divider sx={{ my: 1.5 }} />
                <Typography variant="body2" color="text.secondary">
                  {duty.observations}
                </Typography>
              </>
            )}
          </CardContent>
        </Card>
      ))}
    </Stack>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <Box display="flex" justifyContent="space-between">
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" fontWeight={600}>
        {value}
      </Typography>
    </Box>
  );
}
