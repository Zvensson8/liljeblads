import { useState, useEffect, createContext, useContext, ReactNode, useCallback, useRef } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

// Inactivity timeout: 30 minutes
const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<Session | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const warningTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const logoutTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasWarnedRef = useRef(false);

  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } finally {
      setUser(null);
      setSession(null);
      navigate('/auth');
    }
  }, [navigate]);

  const refreshSession = useCallback(async () => {
    const { data, error } = await supabase.auth.refreshSession();
    if (error) throw error;
    setSession(data.session);
    setUser(data.session?.user ?? null);
    return data.session;
  }, []);

  // Inactivity timeout logic
  useEffect(() => {
    if (!session) return;

    const resetTimeout = () => {
      hasWarnedRef.current = false;
      
      // Clear both timeouts
      if (warningTimeoutRef.current) {
        clearTimeout(warningTimeoutRef.current);
      }
      if (logoutTimeoutRef.current) {
        clearTimeout(logoutTimeoutRef.current);
      }

      // Warn 2 minutes before logout
      warningTimeoutRef.current = setTimeout(() => {
        if (!hasWarnedRef.current) {
          hasWarnedRef.current = true;
          toast.warning('Du kommer loggas ut om 2 minuter på grund av inaktivitet', {
            duration: 10000,
          });
        }
      }, INACTIVITY_TIMEOUT_MS - 2 * 60 * 1000);

      // Actual logout - now properly tracked and cleared on activity
      logoutTimeoutRef.current = setTimeout(() => {
        toast.info('Du har loggats ut på grund av inaktivitet');
        signOut();
      }, INACTIVITY_TIMEOUT_MS);
    };

    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'mousemove'];
    
    events.forEach(event => {
      window.addEventListener(event, resetTimeout, { passive: true });
    });

    resetTimeout();

    return () => {
      events.forEach(event => {
        window.removeEventListener(event, resetTimeout);
      });
      if (warningTimeoutRef.current) {
        clearTimeout(warningTimeoutRef.current);
      }
      if (logoutTimeoutRef.current) {
        clearTimeout(logoutTimeoutRef.current);
      }
    };
  }, [session, signOut]);

  useEffect(() => {
    const clearLocalSession = async () => {
      try {
        // Drop stale localStorage tokens without calling the network again
        await supabase.auth.signOut({ scope: 'local' });
      } catch {
        // ignore
      }
      setSession(null);
      setUser(null);
      setLoading(false);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        // Tab focus/visibility changes cause Supabase to fire TOKEN_REFRESHED
        // (and sometimes SIGNED_IN with the same user). Blindly calling
        // setSession/setUser creates new object identities that ripple through
        // the context and can remount subtrees — closing open dialogs and
        // discarding unsaved form input. Only update state when the user
        // actually changes.
        setLoading(false);

        // Invalid/expired refresh token → Supabase emits SIGNED_OUT with null session
        if (event === 'SIGNED_OUT' || !newSession) {
          setUser(null);
          setSession(null);
          return;
        }

        setUser((prevUser) => {
          const nextUser = newSession.user ?? null;
          if (prevUser?.id === nextUser?.id) return prevUser;
          return nextUser;
        });
        setSession((prevSession) => {
          // Same user + same access token: keep reference to avoid remounts
          if (
            prevSession?.user?.id === newSession.user?.id &&
            prevSession?.access_token === newSession.access_token
          ) {
            return prevSession;
          }
          // Token refreshed: update session so consumers get fresh access_token
          return newSession;
        });
      }
    );

    supabase.auth
      .getSession()
      .then(({ data: { session }, error }) => {
        if (error) {
          console.error('Failed to restore session', error);
          void clearLocalSession();
          return;
        }
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to restore session', err);
        void clearLocalSession();
      });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut, refreshSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
