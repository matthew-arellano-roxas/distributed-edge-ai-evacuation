import DashboardRoundedIcon from '@mui/icons-material/DashboardRounded';
import MenuRoundedIcon from '@mui/icons-material/MenuRounded';
import SensorsRoundedIcon from '@mui/icons-material/SensorsRounded';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import VideocamRoundedIcon from '@mui/icons-material/VideocamRounded';
import StreamRoundedIcon from '@mui/icons-material/StreamRounded';
import {
  AppBar,
  Box,
  Chip,
  Container,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Toolbar,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { NavLink, Outlet } from 'react-router';

const navItems = [
  { to: '/', label: 'Overview', icon: <DashboardRoundedIcon fontSize="small" /> },
  { to: '/live-data', label: 'Live Data', icon: <StreamRoundedIcon fontSize="small" /> },
  { to: '/controls', label: 'Controls', icon: <SensorsRoundedIcon fontSize="small" /> },
  { to: '/cameras', label: 'Cameras', icon: <VideocamRoundedIcon fontSize="small" /> },
  {
    to: '/rbac',
    label: 'RBAC',
    icon: <ShieldOutlinedIcon fontSize="small" />,
    disabled: true,
    note: 'Not available yet',
  },
];

const drawerWidth = 260;

export function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);

  const navigation = (
    <Stack
      sx={{
        height: '100%',
        minWidth: 0,
        overflow: 'hidden',
        background:
          'linear-gradient(180deg, rgba(8,17,31,0.98) 0%, rgba(15,23,42,0.98) 100%)',
      }}
    >
      <Box sx={{ px: 2, py: 2 }}>
        <Typography variant="overline" color="primary.light" sx={{ letterSpacing: '0.14em' }}>
          Navigation
        </Typography>
        <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.1, mt: 0.25 }}>
          Smart Building Ops
        </Typography>
      </Box>
      <Divider />
      <Box sx={{ flexGrow: 1, minHeight: 0, overflowY: 'auto', px: 1.25, py: 1.5 }}>
      <List sx={{ p: 0 }}>
        {navItems.map((item) => (
          <ListItemButton
            key={item.to}
            component={item.disabled ? 'button' : NavLink}
            to={item.disabled ? undefined : item.to}
            onClick={() => {
              if (!item.disabled) {
                setMobileOpen(false);
              }
            }}
            disabled={item.disabled}
            sx={{
              minHeight: 48,
              borderRadius: 3,
              mb: 0.75,
              px: 1.25,
              backgroundColor: 'rgba(15, 23, 42, 0.45)',
              border: '1px solid transparent',
              opacity: item.disabled ? 0.58 : 1,
              '&.active': {
                backgroundColor: 'rgba(56, 189, 248, 0.14)',
                borderColor: 'rgba(56, 189, 248, 0.18)',
              },
              '&:hover': {
                backgroundColor: item.disabled
                  ? 'rgba(15, 23, 42, 0.45)'
                  : 'rgba(30, 41, 59, 0.9)',
              },
            }}
          >
            <ListItemIcon sx={{ minWidth: 38, color: 'inherit' }}>
              {item.icon}
            </ListItemIcon>
            <ListItemText
              primary={item.label}
              secondary={item.note}
              primaryTypographyProps={{
                fontSize: '0.95rem',
                fontWeight: 600,
              }}
              secondaryTypographyProps={{
                fontSize: '0.72rem',
                color: 'text.secondary',
              }}
            />
            {item.disabled ? (
              <Chip
                label="Soon"
                size="small"
                variant="outlined"
                sx={{
                  height: 22,
                  fontSize: '0.68rem',
                  borderColor: 'rgba(148, 163, 184, 0.16)',
                }}
              />
            ) : null}
          </ListItemButton>
        ))}
      </List>
      </Box>
    </Stack>
  );

  return (
    <Box
      sx={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #08111f 0%, #0f172a 100%)',
        overflowX: 'clip',
      }}
    >
      <Box component="nav">
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', md: 'none' },
            '& .MuiDrawer-paper': {
              width: 'min(88vw, 300px)',
              boxSizing: 'border-box',
              backgroundColor: '#08111f',
              overflow: 'hidden',
            },
          }}
        >
          {navigation}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', md: 'block' },
            '& .MuiDrawer-paper': {
              width: drawerWidth,
              boxSizing: 'border-box',
              backgroundColor: '#08111f',
              borderRight: '1px solid rgba(148, 163, 184, 0.18)',
              overflow: 'hidden',
            },
          }}
          open
        >
          {navigation}
        </Drawer>
      </Box>

      <AppBar
        position="fixed"
        color="transparent"
        elevation={0}
        sx={{
          width: { xs: '100%', md: `calc(100% - ${drawerWidth}px)` },
          ml: { md: `${drawerWidth}px` },
          backdropFilter: 'blur(14px)',
          borderBottom: '1px solid rgba(148, 163, 184, 0.18)',
        }}
      >
        <Toolbar
          sx={{
            gap: 1.5,
            minHeight: { xs: 64, md: 72 },
            px: { xs: 2, sm: 3 },
          }}
        >
          <IconButton
            color="inherit"
            edge="start"
            onClick={() => setMobileOpen(true)}
            sx={{ display: { md: 'none' } }}
          >
            <MenuRoundedIcon />
          </IconButton>
          <Box sx={{ flexGrow: 1 }}>
            <Typography
              variant="h6"
              sx={{
                fontWeight: 700,
                fontSize: { xs: '1rem', sm: '1.25rem' },
                lineHeight: 1.1,
              }}
            >
              Smart Building Ops
            </Typography>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ display: { xs: 'none', sm: 'block' } }}
            >
              Live data in Firebase, commands in backend
            </Typography>
          </Box>
        </Toolbar>
      </AppBar>

      <Box
        component="main"
        sx={{
          minWidth: 0,
          width: { xs: '100%', md: `calc(100% - ${drawerWidth}px)` },
          ml: { md: `${drawerWidth}px` },
          pt: { xs: '72px', md: '84px' },
        }}
      >
        <Container maxWidth="xl" sx={{ px: { xs: 2, sm: 3 }, py: { xs: 2.5, md: 4 } }}>
          <Outlet />
        </Container>
      </Box>
    </Box>
  );
}
