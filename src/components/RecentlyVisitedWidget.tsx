import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, Building2, Package, Briefcase, Wrench } from "lucide-react";
import { useRecentlyVisited, RecentlyVisitedItem } from "@/hooks/useRecentlyVisited";
import { Button } from "@/components/ui/button";

export function RecentlyVisitedWidget() {
  const navigate = useNavigate();
  const { getRecentItems } = useRecentlyVisited();
  const [items, setItems] = useState<RecentlyVisitedItem[]>([]);

  useEffect(() => {
    setItems(getRecentItems());
  }, []);

  const getIcon = (type: string) => {
    switch (type) {
      case "property":
        return <Building2 className="h-4 w-4 text-primary" />;
      case "component":
        return <Package className="h-4 w-4 text-primary" />;
      case "work_order":
        return <Wrench className="h-4 w-4 text-primary" />;
      case "project":
        return <Briefcase className="h-4 w-4 text-primary" />;
      default:
        return <Clock className="h-4 w-4 text-primary" />;
    }
  };

  if (items.length === 0) {
    return null;
  }

  return (
    <Card className="hover:shadow-[var(--shadow-elegant)] transition-all">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Clock className="h-5 w-5 text-primary" />
          Senast besökta
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {items.slice(0, 5).map((item) => (
            <Button
              key={item.id}
              variant="ghost"
              className="w-full justify-start gap-3 h-auto py-2"
              onClick={() => navigate(item.path)}
            >
              {getIcon(item.type)}
              <div className="flex-1 text-left">
                <div className="font-medium text-sm">{item.title}</div>
              </div>
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
