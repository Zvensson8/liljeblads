import { Loader2 } from "lucide-react";
import { useWorkspaceBootstrap } from "@/hooks/useWorkspaceBootstrap";
import { Button } from "@/components/ui/button";

/**
 * Blocks the authenticated app until the user has a workspace (org).
 * Children render only when bootstrap is ready.
 */
export function WorkspaceBootstrap({ children }: { children: React.ReactNode }) {
  const { bootstrapping, ready, error } = useWorkspaceBootstrap();

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
        <p className="text-lg font-semibold">Kunde inte förbereda kontot</p>
        <p className="max-w-md text-sm text-muted-foreground">{error}</p>
        <Button onClick={() => window.location.reload()}>Försök igen</Button>
      </div>
    );
  }

  if (!ready || bootstrapping) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Förbereder din organisation…</p>
      </div>
    );
  }

  return <>{children}</>;
}
