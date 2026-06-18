import React, { useEffect, useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Divider,
  Avatar,
  Chip,
  Skeleton,
  Alert,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
} from '@mui/material';
import {
  Badge,
  Home,
  Work,
  LocalHospital,
  FlightTakeoff,
  Email,
  Phone,
  Edit,
  Logout,
  CalendarMonth,
} from '@mui/icons-material';
import { format, parseISO, isAfter, addMonths } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { fetchProfile, updateProfile } from '../lib/firebase/db';

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    async function load() {
      try {
        const data = await fetchProfile(user!.uid);
        setProfile(data);
      } catch (err) {
        console.error('Failed to load profile');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await updateProfile(user.uid, { email: editEmail, phone: editPhone });
      setProfile((prev: any) => prev ? { ...prev, email: editEmail, phone: editPhone } : prev);
      setEditOpen(false);
    } catch (err) {
      console.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const validityChip = (date: string | null): { label: string; color: 'success' | 'warning' | 'error' } => {
    if (!date) return { label: 'N/A', color: 'error' };
    const expiry = parseISO(date);
    if (isAfter(new Date(), expiry)) return { label: 'EXPIRED', color: 'error' };
    if (isAfter(addMonths(new Date(), 1), expiry)) return { label: 'Expiring soon', color: 'warning' };
    return { label: `Valid until ${format(expiry, 'dd MMM yyyy')}`, color: 'success' };
  };

  const medicalStatus = validityChip(profile?.medicalValidity || null);
  const lpcStatus = validityChip(profile?.lpcValidity || null);

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 2 }}>Profile</Typography>

      {loading ? (
        <Skeleton variant="rounded" height={300} />
      ) : profile ? (
        <>
          <Card sx={{ mb: 2 }}>
            <CardContent sx={{ textAlign: 'center', py: 3 }}>
              <Avatar sx={{ width: 80, height: 80, mx: 'auto', mb: 2, bgcolor: 'primary.main', fontSize: 32, fontWeight: 700 }}>
                {profile.fullName.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase()}
              </Avatar>
              <Typography variant="h6" fontWeight={700}>{profile.fullName}</Typography>
              <Typography variant="body2" color="text.secondary">{profile.role}</Typography>
            </CardContent>
          </Card>

          <Card sx={{ mb: 2 }}>
            <List>
              <ListItem><ListItemIcon><Badge /></ListItemIcon>
                <ListItemText primary="CREW CODE" secondary={profile.crewCode}
                  primaryTypographyProps={{ variant: 'caption', color: 'text.secondary' }}
                  secondaryTypographyProps={{ variant: 'body1', fontWeight: 600 }} />
              </ListItem>
              <Divider component="li" />
              <ListItem><ListItemIcon><Home /></ListItemIcon>
                <ListItemText primary="Base" secondary={profile.base}
                  primaryTypographyProps={{ variant: 'caption', color: 'text.secondary' }}
                  secondaryTypographyProps={{ variant: 'body1', fontWeight: 600 }} />
              </ListItem>
              <Divider component="li" />
              <ListItem><ListItemIcon><Work /></ListItemIcon>
                <ListItemText primary="Role" secondary={profile.role}
                  primaryTypographyProps={{ variant: 'caption', color: 'text.secondary' }}
                  secondaryTypographyProps={{ variant: 'body1', fontWeight: 600 }} />
              </ListItem>
              <Divider component="li" />
              <ListItem><ListItemIcon><Email /></ListItemIcon>
                <ListItemText primary="Email" secondary={profile.email || 'Not set'}
                  primaryTypographyProps={{ variant: 'caption', color: 'text.secondary' }}
                  secondaryTypographyProps={{ variant: 'body1' }} />
              </ListItem>
              <Divider component="li" />
              <ListItem><ListItemIcon><Phone /></ListItemIcon>
                <ListItemText primary="Phone" secondary={profile.phone || 'Not set'}
                  primaryTypographyProps={{ variant: 'caption', color: 'text.secondary' }}
                  secondaryTypographyProps={{ variant: 'body1' }} />
              </ListItem>
            </List>
          </Card>

          <Card sx={{ mb: 2 }}>
            <List>
              <ListItem><ListItemIcon><LocalHospital /></ListItemIcon>
                <ListItemText primary="Medical Validity" primaryTypographyProps={{ variant: 'caption', color: 'text.secondary' }} />
                <Chip label={medicalStatus.label} color={medicalStatus.color} size="small" />
              </ListItem>
              <Divider component="li" />
              <ListItem><ListItemIcon><FlightTakeoff /></ListItemIcon>
                <ListItemText primary="LPC/OPC Validity" primaryTypographyProps={{ variant: 'caption', color: 'text.secondary' }} />
                <Chip label={lpcStatus.label} color={lpcStatus.color} size="small" />
              </ListItem>
            </List>
          </Card>

          <Button variant="outlined" fullWidth startIcon={<Edit />} onClick={() => { setEditEmail(profile.email || ''); setEditPhone(profile.phone || ''); setEditOpen(true); }} sx={{ mb: 1 }}>
            Edit Contact Info
          </Button>
          <Button variant="outlined" fullWidth startIcon={<CalendarMonth />} onClick={() => navigate('/calendar')} color="secondary" sx={{ mb: 1 }}>
            Calendar Export
          </Button>
          <Button variant="outlined" fullWidth startIcon={<Logout />} onClick={handleLogout} color="error">Sign Out</Button>
        </>
      ) : (
        <Alert severity="error">Failed to load profile.</Alert>
      )}

      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Contact Info</DialogTitle>
        <DialogContent>
          <TextField label="Email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} fullWidth margin="normal" type="email" />
          <TextField label="Phone" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} fullWidth margin="normal" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button onClick={handleSave} variant="contained" disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
