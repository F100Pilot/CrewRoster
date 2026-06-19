import { useState } from 'react';
import {
  Avatar, Box, Button, Dialog, DialogContent, DialogTitle, Divider,
  IconButton, ListItemAvatar, ListItemText, Menu,
  MenuItem, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import { Add, Check, Delete, Person } from '@mui/icons-material';
import { useRoster } from '../state/useRoster';
import type { UserProfile } from '../domain/types';

const AVATAR_COLORS = [
  '#1565c0', '#2e7d32', '#c62828', '#6a1b9a',
  '#00838f', '#e65100', '#558b2f', '#4527a0',
];

function avatarColor(userId: string): string {
  const hash = userId.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function initials(name: string): string {
  return name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

function UserAvatar({ user, size = 32 }: { user: UserProfile; size?: number }) {
  return (
    <Avatar sx={{ width: size, height: size, bgcolor: avatarColor(user.id), fontSize: size * 0.4 }}>
      {initials(user.name)}
    </Avatar>
  );
}

// ── Create-user dialog ───────────────────────────────────────────────────────────

export function CreateUserDialog({
  open,
  onClose,
  title = 'Novo utilizador',
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
}) {
  const { createUser } = useRoster();
  const [name, setName] = useState('');
  const [crewCode, setCrewCode] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit() {
    if (!name.trim()) return;
    setBusy(true);
    await createUser(name, crewCode);
    setName('');
    setCrewCode('');
    setBusy(false);
    onClose();
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} pt={0.5}>
          <TextField
            label="Nome"
            placeholder="Ex: João Silva"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            autoFocus
            fullWidth
            size="small"
          />
          <TextField
            label="Código de tripulante (opcional)"
            placeholder="Ex: FPT001"
            value={crewCode}
            onChange={(e) => setCrewCode(e.target.value)}
            fullWidth
            size="small"
          />
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={!name.trim() || busy}
            startIcon={<Person />}
          >
            {title === 'Bem-vindo!' ? 'Começar' : 'Criar'}
          </Button>
        </Stack>
      </DialogContent>
    </Dialog>
  );
}

// ── User switcher (AppBar button + menu) ───────────────────────────────────────────

export default function UserSwitcher() {
  const { users, activeUser, switchUser, deleteUser } = useRoster();
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);
  const [createOpen, setCreateOpen] = useState(false);

  if (!activeUser) return null;

  return (
    <>
      <Tooltip title={`${activeUser.name}${activeUser.crewCode ? ` · ${activeUser.crewCode}` : ''}`}>
        <IconButton onClick={(e) => setAnchor(e.currentTarget)} sx={{ p: 0.5 }}>
          <UserAvatar user={activeUser} size={30} />
        </IconButton>
      </Tooltip>

      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        PaperProps={{ sx: { minWidth: 220 } }}
      >
        <Box sx={{ px: 2, py: 1 }}>
          <Typography variant="caption" color="text.secondary">Utilizador ativo</Typography>
        </Box>

        {users.map((u) => (
          <MenuItem
            key={u.id}
            selected={u.id === activeUser.id}
            sx={{ gap: 1 }}
            onClick={() => { switchUser(u.id); setAnchor(null); }}
          >
            <ListItemAvatar sx={{ minWidth: 36 }}>
              <UserAvatar user={u} size={28} />
            </ListItemAvatar>
            <ListItemText
              primary={u.name}
              secondary={u.crewCode}
              primaryTypographyProps={{ variant: 'body2', fontWeight: u.id === activeUser.id ? 700 : 400 }}
              secondaryTypographyProps={{ variant: 'caption' }}
            />
            {u.id === activeUser.id && <Check fontSize="small" color="primary" />}
            {users.length > 1 && (
              <IconButton
                size="small"
                onClick={(e) => { e.stopPropagation(); deleteUser(u.id); setAnchor(null); }}
                sx={{ ml: 0.5, color: 'error.main' }}
              >
                <Delete fontSize="small" />
              </IconButton>
            )}
          </MenuItem>
        ))}

        <Divider />
        <MenuItem onClick={() => { setCreateOpen(true); setAnchor(null); }}>
          <Add fontSize="small" sx={{ mr: 1 }} />
          <Typography variant="body2">Adicionar utilizador</Typography>
        </MenuItem>
      </Menu>

      <CreateUserDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </>
  );
}
