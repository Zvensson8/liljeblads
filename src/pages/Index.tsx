import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Compass } from 'lucide-react';

const Index = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading) {
      if (user) {
        navigate('/properties');
      } else {
        navigate('/auth');
      }
    }
  }, [user, loading, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center animate-pulse">
          <Compass className="h-8 w-8 text-primary-foreground" />
        </div>
        <div className="text-center">
          <h2 className="text-xl font-bold mb-1">NavRitning</h2>
          <p className="text-muted-foreground">Laddar...</p>
        </div>
      </div>
    </div>
  );
};

export default Index;
