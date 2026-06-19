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
              {duty.reportingTime && (
                <Chip
                  label={`Check-in ${duty.reportingTime} UTC`}
                  size="small"
                  color="primary"
                  variant="outlined"
                />
              )}
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
                    <Typography variant="body2" fontWeight={600} color="primary.main">
                      {duty.departureTime || '—'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      STD (UTC)
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
                    <Typography variant="body2" fontWeight={600} color="primary.main">
                      {duty.arrivalTime || '—'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      STA (UTC)
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

            {(duty.dutyType === 'Training' || duty.dutyType === 'Simulator') &&
              (duty.departureTime || duty.arrivalTime) && (
                <Box sx={{ bgcolor: 'grey.50', borderRadius: 2, p: 2, mb: 2 }}>
                  <Box display="flex" justifyContent="space-around">
                    <Box textAlign="center">
                      <Typography variant="body2" fontWeight={600} color="primary.main">
                        {duty.departureTime || '—'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Início (UTC)
                      </Typography>
                    </Box>
                    <Box textAlign="center">
                      <Typography variant="body2" fontWeight={600} color="primary.main">
                        {duty.arrivalTime || '—'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Fim (UTC)
                      </Typography>
                    </Box>
                  </Box>
                  {duty.departureAirport && (
                    <Typography variant="caption" color="text.secondary" display="block" textAlign="center" mt={1}>
                      {duty.departureAirport}
                    </Typography>
                  )}
                </Box>
              )}

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
