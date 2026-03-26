import GoogleIcon from '@mui/icons-material/Google';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Stack,
  Typography,
} from '@mui/material';
import { useAuthStore } from '../store/useAuthStore';

export function LoginPage() {
  const { loginWithGoogle, loading, error } = useAuthStore();

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        px: 2,
      }}
    >
      <Card sx={{ maxWidth: 520, width: '100%' }}>
        <CardContent sx={{ p: 4 }}>
          <Stack spacing={3}>
            <div>
              <Typography variant="overline" color="primary.light">
                Firebase Authentication
              </Typography>
              <Typography variant="h3">Sign in to the ops console</Typography>
              <Typography color="text.secondary" sx={{ mt: 1 }}>
                Use Google login to access live Firebase data in the frontend
                and send operational commands through the backend.
              </Typography>
            </div>

            {error ? <Alert severity="error">{error}</Alert> : null}

            <Button
              variant="contained"
              size="large"
              startIcon={loading ? <CircularProgress color="inherit" size={18} /> : <GoogleIcon />}
              onClick={() => {
                void loginWithGoogle();
              }}
              disabled={loading}
            >
              {loading ? 'Signing in...' : 'Continue with Google'}
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
