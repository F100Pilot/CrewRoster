import { useEffect, useState } from 'react';
import { Box, Card, CardActionArea, CardContent, Typography } from '@mui/material';
import { Badge, ChevronRight } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { loadDocuments } from '../storage/rosterStore';
import { DOC_ALERT_DAYS, describeAlert, documentAlerts, type DocAlert } from '../domain/documentAlerts';

// A heads-up line on the roster page when a document is expired or about to — and nothing at
// all otherwise, so the page stays light. Taps through to the Documents page. Its own line rather
// than part of the limits summary, because it leads somewhere else.
export default function DocumentAlertCard({ userId }: { userId: string }) {
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState<DocAlert[]>([]);
  useEffect(() => {
    let alive = true;
    loadDocuments(userId)
      .then((docs) => { if (alive) setAlerts(documentAlerts(docs, new Date().toISOString().slice(0, 10))); })
      .catch(() => { if (alive) setAlerts([]); });
    return () => { alive = false; };
  }, [userId]);

  if (alerts.length === 0) return null;
  const first = alerts[0];
  const tone = first.level === 'error' ? 'error.main' : 'warning.main';

  return (
    <Card variant="outlined" sx={{ borderLeft: 4, borderLeftColor: tone }}>
      <CardActionArea onClick={() => navigate('/documents')}>
        <CardContent sx={{ py: 1, '&:last-child': { pb: 1 }, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Badge fontSize="small" color="action" />
          <Box flexGrow={1} minWidth={0}>
            <Typography variant="body2" fontWeight={600} noWrap color={tone}>
              {describeAlert(first)}
            </Typography>
            {alerts.length > 1 && (
              <Typography variant="caption" color="text.secondary" display="block" noWrap>
                +{alerts.length - 1} {alerts.length === 2 ? 'documento' : 'documentos'} nos próximos {DOC_ALERT_DAYS} dias
              </Typography>
            )}
          </Box>
          <ChevronRight color="action" />
        </CardContent>
      </CardActionArea>
    </Card>
  );
}
