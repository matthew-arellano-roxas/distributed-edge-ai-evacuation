import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { AppLayout } from './layout/AppLayout';
import { CamerasPage } from './pages/CamerasPage';
import { ControlsPage } from './pages/ControlsPage';
import { LiveDataPage } from './pages/LiveDataPage';
import { OverviewPage } from './pages/OverviewPage';

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
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <RouterProvider router={router} />
    </ThemeProvider>
  );
}

export default App;
