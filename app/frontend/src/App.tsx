import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { AppLayout } from './layout/AppLayout';
import { CamerasPage } from './pages/CamerasPage';
import { ControlsPage } from './pages/ControlsPage';
import { LiveDataPage } from './pages/LiveDataPage';
import { OverviewPage } from './pages/OverviewPage';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#14532d',
    },
    secondary: {
      main: '#1d4ed8',
    },
    background: {
      default: '#f4f1ea',
      paper: 'rgba(255, 252, 246, 0.88)',
    },
    text: {
      primary: '#1f2937',
      secondary: '#5b6472',
    },
  },
  shape: {
    borderRadius: 20,
  },
  typography: {
    fontFamily: '"Roboto", "Segoe UI", sans-serif',
    h1: { fontWeight: 800 },
    h2: { fontWeight: 800 },
    h3: { fontWeight: 800 },
    h4: { fontWeight: 700 },
    h5: { fontWeight: 700 },
    h6: { fontWeight: 700 },
    button: {
      textTransform: 'none',
      fontWeight: 700,
    },
  },
  components: {
    MuiCard: {
      styleOverrides: {
        root: {
          border: '1px solid rgba(31, 41, 55, 0.08)',
          boxShadow: '0 20px 40px rgba(94, 82, 64, 0.08)',
          backdropFilter: 'blur(16px)',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 999,
          paddingInline: 18,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 999,
        },
      },
    },
  },
});

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <OverviewPage /> },
      { path: 'live-data', element: <LiveDataPage /> },
      { path: 'controls', element: <ControlsPage /> },
      { path: 'cameras', element: <CamerasPage /> },
    ],
  },
]);

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <RouterProvider router={router} />
    </ThemeProvider>
  );
}

export default App;
