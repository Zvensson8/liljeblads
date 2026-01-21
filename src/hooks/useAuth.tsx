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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasWarnedRef = useRef(false);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    navigate('/auth');
  }, [navigate]);

  // Inactivity timeout logic
  useEffect(() => {
    if (!session) return;

    const resetTimeout = () => {
      hasWarnedRef.current = false;
      
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Warn 2 minutes before logout
      timeoutRef.current = setTimeout(() => {
        if (!hasWarnedRef.current) {
          hasWarnedRef.current = true;
          toast.warning('Du kommer loggas ut om 2 minuter på grund av inaktivitet', {
            duration: 10000,
          });
        }
      }, INACTIVITY_TIMEOUT_MS - 2 * 60 * 1000);

      // Actual logout
      setTimeout(() => {
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
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [session, signOut]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut }}>
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
