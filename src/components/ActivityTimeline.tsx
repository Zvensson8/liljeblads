import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { format, formatDistanceToNow } from "date-fns";
import { sv } from "date-fns/locale";
import { FileText, CheckSquare, Wrench, Phone, File as FileIcon } from "lucide-react";

interface ActivityTimelineProps {
  propertyId: string;
}

interface Activity {
  id: string;
  type: string;
  description: string;
  timestamp: string;
  icon: string;
}

export const ActivityTimeline = ({ propertyId }: ActivityTimelineProps) => {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchActivities();
  }, [propertyId]);

  const fetchActivities = async () => {
    setLoading(true);
    const allActivities: Activity[] = [];

    // Fetch notes
    const { data: notes } = await supabase
      .from("property_notes")
      .select("*")
      .eq("property_id", propertyId)
      .order("created_at", { ascending: false })
      .limit(5);

    if (notes) {
      allActivities.push(
        ...notes.map((note) => ({
          id: note.id,
          type: "note",
          description: `Anteckning skapad: ${note.content.substring(0, 50)}${note.content.length > 50 ? "..." : ""}`,
          timestamp: note.created_at,
          icon: "📝",
        }))
      );
    }

    // Fetch todos
    const { data: todos } = await supabase
      .from("property_todos")
      .select("*")
      .eq("property_id", propertyId)
      .order("created_at", { ascending: false })
      .limit(5);

    if (todos) {
      allActivities.push(
        ...todos.map((todo) => ({
          id: todo.id,
          type: "todo",
          description: `Att-göra ${todo.completed ? "slutförd" : "skapad"}: ${todo.title}`,
          timestamp: todo.updated_at,
          icon: todo.completed ? "✅" : "☑️",
        }))
      );
    }

    // Fetch work orders
    const { data: workOrders } = await supabase
      .from("work_orders")
      .select("*")
      .eq("property_id", propertyId)
      .order("created_at", { ascending: false })
      .limit(5);

    if (workOrders) {
      allActivities.push(
        ...workOrders.map((wo) => ({
          id: wo.id,
          type: "work_order",
          description: `Arbetsorder: ${wo.action}`,
          timestamp: wo.created_at,
          icon: "🔧",
        }))
      );
    }

    // Fetch contacts
    const { data: contacts } = await supabase
      .from("property_contacts")
      .select("*")
      .eq("property_id", propertyId)
      .order("created_at", { ascending: false })
      .limit(5);

    if (contacts) {
      allActivities.push(
        ...contacts.map((contact) => ({
          id: contact.id,
          type: "contact",
          description: `Kontakt tillagd: ${contact.name}`,
          timestamp: contact.created_at,
          icon: "👤",
        }))
      );
    }

    // Fetch documents
    const { data: documents } = await supabase
      .from("property_documents")
      .select("*")
      .eq("property_id", propertyId)
      .order("created_at", { ascending: false })
      .limit(5);

    if (documents) {
      allActivities.push(
        ...documents.map((doc) => ({
          id: doc.id,
          type: "document",
          description: `Dokument uppladdat: ${doc.name}`,
          timestamp: doc.created_at,
          icon: "📄",
        }))
      );
    }

    // Sort all activities by timestamp
    allActivities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    setActivities(allActivities.slice(0, 10));
    setLoading(false);
  };

  if (loading) {
    return (
      <Card className="animate-fade-in">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span>📊</span>
            Aktivitetsflöde
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Laddar aktiviteter...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="animate-fade-in">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span>📊</span>
          Aktivitetsflöde
        </CardTitle>
      </CardHeader>
      <CardContent>
        {activities.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p className="text-sm">Ingen aktivitet ännu</p>
            <p className="text-xs mt-2">Aktiviteter kommer att visas här när du lägger till data</p>
          </div>
        ) : (
          <div className="space-y-4">
            {activities.map((activity, index) => (
              <div
                key={activity.id}
                className="flex gap-3 animate-slide-in-up"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="flex flex-col items-center">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary shrink-0">
                    <span className="text-sm">{activity.icon}</span>
                  </div>
                  {index < activities.length - 1 && (
                    <div className="w-px h-full bg-border mt-2" />
                  )}
                </div>
                <div className="flex-1 pb-4">
                  <p className="text-sm font-medium">{activity.description}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatDistanceToNow(new Date(activity.timestamp), {
                      addSuffix: true,
                      locale: sv,
                    })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
