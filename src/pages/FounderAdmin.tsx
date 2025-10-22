import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Crown } from "lucide-react";
import { FounderOrganizations } from "@/components/founder/FounderOrganizations";
import { FounderUsers } from "@/components/founder/FounderUsers";
import { FounderStats } from "@/components/founder/FounderStats";
import { FounderPricingHistory } from "@/components/founder/FounderPricingHistory";

export default function FounderAdmin() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [isFounder, setIsFounder] = useState(false);

  useEffect(() => {
    if (!user) {
      navigate("/auth");
      return;
    }
    checkFounderAccess();
  }, [user, navigate]);

  const checkFounderAccess = async () => {
    try {
      setLoading(true);

      // Kolla om användaren har founder-roll
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user?.id)
        .eq("role", "founder" as any)
        .single();

      if (error || !data) {
        toast.error("Du har inte tillgång till founder-panelen");
        navigate("/");
        return;
      }

      setIsFounder(true);
    } catch (error: any) {
      console.error("Error checking founder access:", error);
      navigate("/");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <SidebarProvider>
        <div className="flex min-h-screen w-full">
          <AppSidebar />
          <div className="flex-1 p-8">
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
                <p className="mt-4 text-muted-foreground">Verifierar behörighet...</p>
              </div>
            </div>
          </div>
        </div>
      </SidebarProvider>
    );
  }

  if (!isFounder) return null;

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <main className="flex-1 p-8">
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-br from-yellow-500 to-yellow-600 p-3 rounded-lg">
                <Crown className="h-8 w-8 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold">Founder Admin Panel</h1>
                <p className="text-muted-foreground">
                  Fullständig kontroll över alla organisationer och användare
                </p>
              </div>
            </div>

            {/* Tabs */}
            <Tabs defaultValue="stats" className="space-y-6">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="stats">Översikt</TabsTrigger>
                <TabsTrigger value="organizations">Organisationer</TabsTrigger>
                <TabsTrigger value="users">Användare</TabsTrigger>
                <TabsTrigger value="pricing">Prishistorik</TabsTrigger>
              </TabsList>

              <TabsContent value="stats">
                <FounderStats />
              </TabsContent>

              <TabsContent value="organizations">
                <FounderOrganizations />
              </TabsContent>

              <TabsContent value="users">
                <FounderUsers />
              </TabsContent>

              <TabsContent value="pricing">
                <FounderPricingHistory />
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
