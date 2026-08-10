import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getErrorMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loader2, Building2, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";

interface InvitationPreview {
  id: string;
  token: string;
  organization_id: string;
  organization_name: string;
  email: string;
  role: string;
  expires_at: string;
}

export default function AcceptInvitation() {
  const { token } = useParams<{ token: string }>();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      // Preserve invite token after login
      const next = token ? `/invite/${token}` : "/invite";
      navigate(`/auth?redirect=${encodeURIComponent(next)}`, { replace: true });
      return;
    }
    if (!token) {
      setError("Ogiltig inbjudningslänk");
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: rpcError } = await supabase.rpc(
          "get_invitation_by_token" as never,
          { p_token: token } as never,
        );
        if (rpcError) throw rpcError;
        if (!cancelled) setPreview(data as InvitationPreview);
      } catch (e: unknown) {
        if (!cancelled) setError(getErrorMessage(e) || "Kunde inte hämta inbjudan");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, authLoading, token, navigate]);

  const handleAccept = async () => {
    if (!token) return;
    setAccepting(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc(
        "accept_organization_invitation" as never,
        { p_token: token } as never,
      );
      if (rpcError) throw rpcError;
      const result = data as { organization_id: string; organization_name: string };

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.myOrganizations.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.properties.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.projects.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.workOrders.all }),
      ]);

      setDone(true);
      toast.success(`Du är nu medlem i ${result.organization_name}`);
      setTimeout(() => navigate("/dashboard", { replace: true }), 1200);
    } catch (e: unknown) {
      setError(getErrorMessage(e) || "Kunde inte acceptera inbjudan");
    } finally {
      setAccepting(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2 mb-1">
            <Building2 className="h-5 w-5 text-primary" />
            <CardTitle>Organisationsinbjudan</CardTitle>
          </div>
          <CardDescription>
            Acceptera inbjudan för att få åtkomst till organisationens data.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
              <AlertCircle className="h-4 w-4 mt-0.5 text-destructive shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {done && (
            <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/10 p-3 text-sm">
              <CheckCircle2 className="h-4 w-4 mt-0.5 text-primary shrink-0" />
              <span>Inbjudan accepterad. Omdirigerar…</span>
            </div>
          )}

          {preview && !done && (
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-muted-foreground">Organisation</p>
                <p className="font-medium text-base">{preview.organization_name}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Roll</p>
                <p className="font-medium capitalize">{preview.role}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Inbjuden e-post</p>
                <p className="font-medium">{preview.email}</p>
              </div>
              <Button
                className="w-full"
                onClick={handleAccept}
                disabled={accepting}
              >
                {accepting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Accepterar…
                  </>
                ) : (
                  "Acceptera inbjudan"
                )}
              </Button>
            </div>
          )}

          <Button variant="ghost" className="w-full" asChild>
            <Link to="/dashboard">Till dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
