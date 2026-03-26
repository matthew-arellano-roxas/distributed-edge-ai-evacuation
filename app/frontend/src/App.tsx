import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import { CircularProgress, Stack } from '@mui/material';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { useEffect } from 'react';
import { AppLayout } from './layout/AppLayout';
import { CamerasPage } from './pages/CamerasPage';
import { ControlsPage } from './pages/ControlsPage';
import { LiveDataPage } from './pages/LiveDataPage';
import { LoginPage } from './pages/LoginPage';
import { OverviewPage } from './pages/OverviewPage';
import { useAuthStore } from './store/useAuthStore';

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#38bdf8',
    },
    secondary: {
      main: '#22c55e',
    },
    background: {
      default: '#08111f',
      paper: 'rgba(15, 23, 42, 0.88)',
    },
  },
  shape: {
    borderRadius: 18,
  },
  typography: {
    h3: {
      fontWeight: 800,
    },
  },
});

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      {
        index: true,
        element: <OverviewPage />,
      },
      {
        path: 'controls',
        element: <ControlsPage />,
      },
      {
        path: 'live-data',
        element: <LiveDataPage />,
      },
      {
        path: 'cameras',
        element: <CamerasPage />,
      },
    ],
  },
]);

function App() {
  const { user, loading, initAuth } = useAuthStore();

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {loading ? (
        <Stack
          sx={{ minHeight: '100vh' }}
          alignItems="center"
          justifyContent="center"
        >
          <CircularProgress />
        </Stack>
      ) : user ? (
        <RouterProvider router={router} />
      ) : (
        <LoginPage />
      )}
    </ThemeProvider>
  );
}

export default App;
