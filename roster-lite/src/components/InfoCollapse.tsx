import { useState, type ReactNode } from 'react';
import { Box, ButtonBase, Card, CardContent, Collapse, Typography } from '@mui/material';
import { ExpandMore, InfoOutlined } from '@mui/icons-material';
import { passOverline } from './PassCard';

// Explanations only — how the app counts, what a note means — closed by default (user, Nov 2026: "estas informações que
// são só explicações devem estar colapsadas, nesta e em todas as outras páginas"). Warnings and "em testes" notices
// stay open; this is for the help text around them. `card` = its own card on a page; without it, a row inside one.
export default function InfoCollapse({ title, children, card = true, defaultOpen = false }: {
  title: string; children: ReactNode; card?: boolean; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const head = (
    <ButtonBase onClick={() => setOpen((o) => !o)} aria-expanded={open}
      sx={{ width: '100%', justifyContent: 'flex-start', gap: 0.75, borderRadius: 1, py: 0.5, textAlign: 'left' }}>
      <InfoOutlined sx={{ fontSize: 18, color: 'text.secondary' }} />
      <Typography component="span" sx={{ ...passOverline, flexGrow: 1 }}>{title}</Typography>
      <ExpandMore sx={{ fontSize: 20, color: 'text.secondary', transition: 'transform .2s', transform: open ? 'rotate(180deg)' : 'none' }} />
    </ButtonBase>
  );
  const body = <Collapse in={open} unmountOnExit><Box pt={0.75}>{children}</Box></Collapse>;
  if (!card) return <Box>{head}{body}</Box>;
  return (
    <Card variant="outlined">
      <CardContent sx={{ py: 1, '&:last-child': { pb: 1 } }}>{head}{body}</CardContent>
    </Card>
  );
}
