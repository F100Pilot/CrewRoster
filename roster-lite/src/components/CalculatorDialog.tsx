import { useEffect, useState } from 'react';
import { Box, Button, ButtonBase, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import { Backspace } from '@mui/icons-material';
import { evalExpression } from '../utils/calc';

// A pocket calculator for a money field (user: "nos sítios onde posso acrescentar o somatório de
// valores, deveria ter uma máquina de calcular"). The phone's number keyboard has no "+", so the
// keys are drawn here; "Usar" writes the result back into the field.

const EUR = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const KEYS = ['C', '(', ')', '⌫', '7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '−', '0', ',', '00', '+'];
const OPS = new Set(['÷', '×', '−', '+']);

export default function CalculatorDialog({ open, label, initial, onUse, onClose }: {
  open: boolean; label: string; initial: string; onUse: (value: number) => void; onClose: () => void;
}) {
  const [expr, setExpr] = useState(initial);
  useEffect(() => { if (open) setExpr(initial); }, [open, initial]);
  const result = evalExpression(expr);

  const press = (k: string) => {
    if (k === 'C') return setExpr('');
    if (k === '⌫') return setExpr((e) => e.trimEnd().slice(0, -1).trimEnd());
    setExpr((e) => (OPS.has(k) ? `${e.trimEnd()} ${k} ` : `${e}${k}`));
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ pb: 0.5 }}>{label}</DialogTitle>
      <DialogContent sx={{ pb: 1 }}>
        <Box sx={{ bgcolor: 'action.hover', borderRadius: 2, px: 1.5, py: 1, mb: 1.5, textAlign: 'right' }}>
          <Typography sx={{ fontVariantNumeric: 'tabular-nums', minHeight: 24, wordBreak: 'break-all', color: 'text.secondary' }}>
            {expr || '0'}
          </Typography>
          <Typography sx={{ fontSize: '1.6rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
            {result === null ? (expr ? '…' : EUR.format(0)) : EUR.format(result)}
          </Typography>
        </Box>
        <Box display="grid" gridTemplateColumns="repeat(4, 1fr)" gap={0.75}>
          {KEYS.map((k) => (
            <ButtonBase key={k} onClick={() => press(k)} aria-label={k === '⌫' ? 'Apagar' : k === 'C' ? 'Limpar' : k}
              sx={{
                height: 48, borderRadius: 2, fontSize: '1.15rem', fontWeight: 700,
                bgcolor: OPS.has(k) ? 'primary.main' : k === 'C' || k === '⌫' ? 'action.selected' : 'action.hover',
                color: OPS.has(k) ? 'primary.contrastText' : 'text.primary',
                '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'primary.main' },
              }}>
              {k === '⌫' ? <Backspace fontSize="small" /> : k}
            </ButtonBase>
          ))}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" disabled={result === null} onClick={() => { if (result !== null) { onUse(Math.max(0, result)); onClose(); } }}>
          Usar
        </Button>
      </DialogActions>
    </Dialog>
  );
}
