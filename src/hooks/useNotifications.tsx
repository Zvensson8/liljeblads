import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { Bell } from "lucide-react";

interface Notification {
  id: string;
  type: "warning" | "info" | "success" | "error";
  title: string;
  message: string;
  propertyId?: string;
  timestamp: Date;
  read: boolean;
}

interface NotificationsContextType {
  notifications: Notification[];
  unreadCount: number;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearNotification: (id: string) => void;
}

const NotificationsContext = createContext<NotificationsContextType | undefined>(undefined);

export const NotificationsProvider = ({ children }: { children: React.ReactNode }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const { session } = useAuth();

  const checkOverdueTodos = useCallback(async () => {
    if (!session?.user?.id) return;

    const { data: properties } = await supabase
      .from("properties")
      .select("id, name")
      .eq("owner_id", session.user.id);

    if (!properties) return;

    for (const property of properties) {
      const { data: todos } = await supabase
        .from("property_todos")
        .select("*")
        .eq("property_id", property.id)
        .eq("completed", false)
        .lt("due_date", new Date().toISOString());

      if (todos && todos.length > 0) {
        const notification: Notification = {
          id: `todo-overdue-${property.id}`,
          type: "warning",
          title: "Överfälliga uppgifter",
          message: `${property.name} har ${todos.length} överfälliga uppgift${todos.length > 1 ? "er" : ""}`,
          propertyId: property.id,
          timestamp: new Date(),
          read: false,
        };

        setNotifications((prev) => {
          if (prev.some((n) => n.id === notification.id)) return prev;
          return [notification, ...prev];
        });
      }
    }
  }, [session]);

  const checkUpcomingMaintenance = useCallback(async () => {
    if (!session?.user?.id) return;

    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const { data: components } = await supabase
      .from("components")
      .select(`
        id,
        name,
        next_service_date,
        floors (
          property_id,
          properties (
            id,
            name
          )
        )
      `)
      .not("next_service_date", "is", null)
      .lte("next_service_date", thirtyDaysFromNow.toISOString())
      .gte("next_service_date", new Date().toISOString());

    if (components && components.length > 0) {
      type ComponentRow = {
        id: string;
        name: string;
        floors?: { properties?: { id: string; name: string } | null } | null;
      };
      (components as unknown as ComponentRow[]).forEach((component) => {
        const property = component.floors?.properties;
        if (!property) return;

        const notification: Notification = {
          id: `maintenance-${component.id}`,
          type: "info",
          title: "Kommande underhåll",
          message: `${component.name} i ${property.name} behöver service inom 30 dagar`,
          propertyId: property.id,
          timestamp: new Date(),
          read: false,
        };

        setNotifications((prev) => {
          if (prev.some((n) => n.id === notification.id)) return prev;
          return [notification, ...prev];
        });
      });
    }
  }, [session]);

  const checkStaleWorkOrders = useCallback(async () => {
    if (!session?.user?.id) return;

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: workOrders } = await supabase
      .from("work_orders")
      .select(`
        id,
        action,
        updated_at,
        properties (
          id,
          name
        )
      `)
      .in("status", ["not_started", "ordered", "awaiting_quote"])
      .lt("updated_at", sevenDaysAgo.toISOString());

    if (workOrders && workOrders.length > 0) {
      type WorkOrderRow = {
        id: string;
        action: string;
        properties: { id: string; name: string };
      };
      (workOrders as unknown as WorkOrderRow[]).forEach((wo) => {
        const notification: Notification = {
          id: `work-order-stale-${wo.id}`,
          type: "warning",
          title: "Inaktiv arbetsorder",
          message: `Arbetsorder "${wo.action}" i ${wo.properties.name} har inte uppdaterats på över 7 dagar`,
          propertyId: wo.properties.id,
          timestamp: new Date(),
          read: false,
        };

        setNotifications((prev) => {
          if (prev.some((n) => n.id === notification.id)) return prev;
          return [notification, ...prev];
        });
      });
    }
  }, [session]);

  useEffect(() => {
    if (session?.user?.id) {
      checkOverdueTodos();
      checkUpcomingMaintenance();
      checkStaleWorkOrders();

      // Check every 5 minutes
      const interval = setInterval(() => {
        checkOverdueTodos();
        checkUpcomingMaintenance();
        checkStaleWorkOrders();
      }, 5 * 60 * 1000);

      return () => clearInterval(interval);
    }
  }, [session, checkOverdueTodos, checkUpcomingMaintenance, checkStaleWorkOrders]);

  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const clearNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <NotificationsContext.Provider
      value={{
        notifications,
        unreadCount,
        markAsRead,
        markAllAsRead,
        clearNotification,
      }}
    >
      {children}
    </NotificationsContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error("useNotifications must be used within NotificationsProvider");
  }
  return context;
};
