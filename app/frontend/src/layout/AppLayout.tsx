import DashboardRoundedIcon from '@mui/icons-material/DashboardRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import VideocamRoundedIcon from '@mui/icons-material/VideocamRounded';
import {
  AppBar,
  Box,
  Button,
  Container,
  Stack,
  Toolbar,
  Typography,
} from '@mui/material';
import { NavLink, Outlet } from 'react-router';

const navItems = [
  { to: '/', label: 'Dashboard', icon: <DashboardRoundedIcon fontSize="small" /> },
  { to: '/controls', label: 'Controls', icon: <TuneRoundedIcon fontSize="small" /> },
  { to: '/cameras', label: 'Cameras', icon: <VideocamRoundedIcon fontSize="small" /> },
];

export function AppLayout() {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        background:
          'radial-gradient(circle at top left, rgba(22,101,52,0.12), transparent 28%), radial-gradient(circle at top right, rgba(29,78,216,0.1), transparent 24%), linear-gradient(180deg, #f6f2e8 0%, #efe7da 100%)',
        overflowX: 'clip',
      }}
    >
      <AppBar
        position="sticky"
        color="transparent"
        elevation={0}
        sx={{
          backdropFilter: 'blur(18px)',
          backgroundColor: 'rgba(246, 242, 232, 0.82)',
          borderBottom: '1px solid rgba(31, 41, 55, 0.08)',
        }}
      >
        <Toolbar sx={{ minHeight: 80, py: 1.5, alignItems: 'flex-start' }}>
          <Container maxWidth="xl" sx={{ px: { xs: 2, sm: 3 } }}>
            <Stack spacing={1.5}>
              <Stack
                direction={{ xs: 'column', md: 'row' }}
                justifyContent="space-between"
                spacing={1.5}
                alignItems={{ xs: 'flex-start', md: 'center' }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Typography
                    variant="overline"
                    sx={{ color: 'primary.main', letterSpacing: '0.16em' }}
                  >
                    Smart Building Monitor
                  </Typography>
                  <Typography variant="h5" sx={{ lineHeight: 1.05 }}>
                    Simple live dashboard for fire, alerts, devices, controls, cameras, and occupancy
                  </Typography>
                </Box>
              </Stack>

              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                {navItems.map((item) => (
                  <Button
                    key={item.to}
                    component={NavLink}
                    to={item.to}
                    startIcon={item.icon}
                    sx={{
                      color: 'text.primary',
                      backgroundColor: 'rgba(255,255,255,0.62)',
                      border: '1px solid rgba(31, 41, 55, 0.08)',
                      '&.active': {
                        backgroundColor: 'primary.main',
                        color: '#f8fafc',
                      },
                    }}
                  >
                    {item.label}
                  </Button>
                ))}
              </Stack>
            </Stack>
          </Container>
        </Toolbar>
      </AppBar>

      <Box component="main" sx={{ py: { xs: 2.5, md: 4 } }}>
        <Container maxWidth="xl" sx={{ px: { xs: 2, sm: 3 } }}>
          <Outlet />
        </Container>
      </Box>
    </Box>
  );
}
