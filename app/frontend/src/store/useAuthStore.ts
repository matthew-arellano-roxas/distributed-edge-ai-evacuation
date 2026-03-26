import type { User } from 'firebase/auth';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { create } from 'zustand';
import { auth, googleProvider } from '../lib/firebase';

type AuthStore = {
  user: User | null;
  loading: boolean;
  initialized: boolean;
  error: string | null;
  initAuth: () => void;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
};

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  loading: true,
  initialized: false,
  error: null,
  initAuth: () => {
    if (get().initialized) {
      return;
    }

    set({ initialized: true, loading: true, error: null });

    onAuthStateChanged(auth, (user) => {
      set({ user, loading: false, error: null });
    });
  },
  loginWithGoogle: async () => {
    set({ error: null, loading: true });

    try {
      await signInWithPopup(auth, googleProvider);
      set({ loading: false });
    } catch (error) {
      set({
        error: formatError(error),
        loading: false,
      });
    }
  },
  logout: async () => {
    set({ error: null, loading: true });

    try {
      await signOut(auth);
      set({ loading: false });
    } catch (error) {
      set({
        error: formatError(error),
        loading: false,
      });
    }
  },
}));
