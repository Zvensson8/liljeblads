import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';

interface OfflineAction {
  id: string;
  type: 'create' | 'update' | 'delete';
  table: string;
  data: Record<string, unknown>;
  timestamp: number;
}

const OFFLINE_STORAGE_KEY = 'navritning_offline_actions';

export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingActions, setPendingActions] = useState<OfflineAction[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);

  // Load pending actions from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(OFFLINE_STORAGE_KEY);
    if (stored) {
      try {
        setPendingActions(JSON.parse(stored));
      } catch (e) {
        console.error('Failed to parse offline actions:', e);
      }
    }
  }, []);

  // Save pending actions to localStorage when they change
  useEffect(() => {
    if (pendingActions.length > 0) {
      localStorage.setItem(OFFLINE_STORAGE_KEY, JSON.stringify(pendingActions));
    } else {
      localStorage.removeItem(OFFLINE_STORAGE_KEY);
    }
  }, [pendingActions]);

  // Listen for online/offline events
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast.success('Anslutning återställd', {
        description: pendingActions.length > 0 
          ? `${pendingActions.length} ändringar väntar på synkronisering` 
          : undefined
      });
    };

    const handleOffline = () => {
      setIsOnline(false);
      toast.warning('Offline-läge aktiverat', {
        description: 'Ändringar sparas lokalt och synkroniseras automatiskt'
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [pendingActions.length]);

  // Queue an action for later sync
  const queueAction = useCallback((action: Omit<OfflineAction, 'id' | 'timestamp'>) => {
    const newAction: OfflineAction = {
      ...action,
      id: crypto.randomUUID(),
      timestamp: Date.now()
    };
    
    setPendingActions(prev => [...prev, newAction]);
    return newAction.id;
  }, []);

  // Clear a specific action from the queue
  const clearAction = useCallback((actionId: string) => {
    setPendingActions(prev => prev.filter(a => a.id !== actionId));
  }, []);

  // Clear all pending actions
  const clearAllActions = useCallback(() => {
    setPendingActions([]);
  }, []);

  // Sync all pending actions (call when online)
  const syncPendingActions = useCallback(async (
    syncFn: (action: OfflineAction) => Promise<boolean>
  ) => {
    if (pendingActions.length === 0 || isSyncing) return;
    
    setIsSyncing(true);
    const successfulIds: string[] = [];
    
    for (const action of pendingActions) {
      try {
        const success = await syncFn(action);
        if (success) {
          successfulIds.push(action.id);
        }
      } catch (error) {
        console.error('Failed to sync action:', action, error);
      }
    }
    
    if (successfulIds.length > 0) {
      setPendingActions(prev => prev.filter(a => !successfulIds.includes(a.id)));
      toast.success(`${successfulIds.length} ändringar synkroniserade`);
    }
    
    setIsSyncing(false);
  }, [pendingActions, isSyncing]);

  return {
    isOnline,
    pendingActions,
    pendingCount: pendingActions.length,
    isSyncing,
    queueAction,
    clearAction,
    clearAllActions,
    syncPendingActions
  };
}
