import { useState } from "react";
import { useApiKeys, useCreateApiKey, useDeleteApiKey, type ApiKey } from "@/hooks/useApiKeys";

import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Key, Plus, Trash2, Copy, Eye, EyeOff, AlertTriangle, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// ApiKey type imported from useApiKeys hook


interface OrganizationApiKeysProps {
  organizationId: string;
}

const AVAILABLE_PERMISSIONS = [
  { id: "create_work_order", label: "Skapa arbetsordrar" },
  { id: "create_todo", label: "Skapa todos" },
  { id: "create_project", label: "Skapa projekt" },
  { id: "update_work_order_status", label: "Uppdatera arbetsorderstatus" },
  { id: "get_pending_actions", label: "Hämta väntande AI-åtgärder" },
  { id: "execute_action", label: "Utföra AI-åtgärder" },
  { id: "list_properties", label: "Lista fastigheter" },
  { id: "list_components", label: "Lista komponenter" },
];

// Generate a secure random API key
function generateApiKey(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return "lbl_" + Array.from(array, (b) => chars[b % chars.length]).join("");
}

// Hash API key using SHA-256
async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function OrganizationApiKeys({ organizationId }: OrganizationApiKeysProps) {
  const { user } = useAuth();
  const { data: apiKeys = [], isLoading: loading } = useApiKeys(organizationId);
  const createApiKey = useCreateApiKey();
  const deleteApiKey = useDeleteApiKey();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [keyToDelete, setKeyToDelete] = useState<ApiKey | null>(null);
  const [newKeyName, setNewKeyName] = useState("");
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>(
    AVAILABLE_PERMISSIONS.map((p) => p.id)
  );
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [creating, setCreating] = useState(false);

  const webhookUrl = `https://vfwxpbffadedpvhdxntm.supabase.co/functions/v1/twin-webhook`;

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) {
      toast.error("Ange ett namn för API-nyckeln");
      return;
    }

    if (selectedPermissions.length === 0) {
      toast.error("Välj minst en behörighet");
      return;
    }

    setCreating(true);

    try {
      const rawKey = generateApiKey();
      const keyHash = await hashApiKey(rawKey);
      const keyPrefix = rawKey.substring(0, 8);

      await createApiKey.mutateAsync({
        organizationId,
        name: newKeyName.trim(),
        keyHash,
        keyPrefix,
        permissions: selectedPermissions,
        createdBy: user?.id ?? null,
      });

      setCreatedKey(rawKey);
      toast.success("API-nyckel skapad!");
    } catch (error) {
      console.error("Error creating API key:", error);
      /* toast handled in hook */
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteKey = async () => {
    if (!keyToDelete) return;
    try {
      await deleteApiKey.mutateAsync(keyToDelete.id);
    } finally {
      setShowDeleteDialog(false);
      setKeyToDelete(null);
    }
  };


  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} kopierad!`);
  };

  const handleCloseCreateDialog = () => {
    setShowCreateDialog(false);
    setNewKeyName("");
    setSelectedPermissions(AVAILABLE_PERMISSIONS.map((p) => p.id));
    setCreatedKey(null);
    setShowKey(false);
  };

  const togglePermission = (permissionId: string) => {
    setSelectedPermissions((prev) =>
      prev.includes(permissionId)
        ? prev.filter((p) => p !== permissionId)
        : [...prev, permissionId]
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              API-integrationer
            </CardTitle>
            <CardDescription>
              Hantera API-nycklar för externa integrationer som Twin.so
            </CardDescription>
          </div>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Skapa API-nyckel
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Webhook URL */}
        <div className="p-4 bg-muted rounded-lg space-y-2">
          <Label className="text-sm font-medium">Webhook URL</Label>
          <div className="flex items-center gap-2">
            <code className="flex-1 p-2 bg-background rounded text-sm break-all">
              {webhookUrl}
            </code>
            <Button
              variant="outline"
              size="icon"
              onClick={() => copyToClipboard(webhookUrl, "Webhook URL")}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Använd denna URL tillsammans med din API-nyckel för att göra anrop från externa system.
          </p>
        </div>

        {/* API Keys List */}
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Laddar...</div>
        ) : apiKeys.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Key className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Inga API-nycklar skapade ännu</p>
            <p className="text-sm">Skapa en API-nyckel för att börja integrera med externa system</p>
          </div>
        ) : (
          <div className="space-y-3">
            {apiKeys.map((key) => (
              <div
                key={key.id}
                className="flex items-center justify-between p-4 border rounded-lg"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{key.name}</span>
                    {!key.is_active && (
                      <Badge variant="destructive">Inaktiv</Badge>
                    )}
                    {key.expires_at && new Date(key.expires_at) < new Date() && (
                      <Badge variant="destructive">Utgången</Badge>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    <code className="bg-muted px-1 rounded">{key.key_prefix}...</code>
                    {" • "}
                    Skapad {format(new Date(key.created_at), "d MMM yyyy", { locale: sv })}
                    {key.last_used_at && (
                      <>
                        {" • "}
                        Senast använd{" "}
                        {format(new Date(key.last_used_at), "d MMM yyyy HH:mm", { locale: sv })}
                      </>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {(key.permissions || []).slice(0, 3).map((perm) => {
                      const permLabel = AVAILABLE_PERMISSIONS.find((p) => p.id === perm)?.label || perm;
                      return (
                        <Badge key={perm} variant="secondary" className="text-xs">
                          {permLabel}
                        </Badge>
                      );
                    })}
                    {(key.permissions || []).length > 3 && (
                      <Badge variant="secondary" className="text-xs">
                        +{key.permissions.length - 3} till
                      </Badge>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:text-destructive"
                  onClick={() => {
                    setKeyToDelete(key);
                    setShowDeleteDialog(true);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Documentation Link */}
        <div className="pt-4 border-t">
          <h4 className="font-medium mb-2">Dokumentation</h4>
          <p className="text-sm text-muted-foreground mb-2">
            API:et stöder följande åtgärder: skapa arbetsordrar, todos, projekt, uppdatera status, 
            lista fastigheter och komponenter.
          </p>
          <div className="bg-muted p-3 rounded-lg">
            <p className="text-sm font-medium mb-1">Exempel-anrop:</p>
            <pre className="text-xs overflow-x-auto">
{`POST ${webhookUrl}
Headers: 
  Content-Type: application/json
  X-API-Key: din_api_nyckel

Body:
{
  "action": "create_work_order",
  "data": {
    "property_name": "Fastighet ABC",
    "title": "Byt filter i ventilation",
    "priority": "high"
  }
}`}
            </pre>
          </div>
        </div>
      </CardContent>

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={handleCloseCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {createdKey ? "API-nyckel skapad!" : "Skapa ny API-nyckel"}
            </DialogTitle>
            <DialogDescription>
              {createdKey
                ? "Kopiera nyckeln nu - den visas bara en gång!"
                : "Ge nyckeln ett namn och välj vilka behörigheter den ska ha."}
            </DialogDescription>
          </DialogHeader>

          {createdKey ? (
            <div className="space-y-4">
              <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-yellow-800 dark:text-yellow-200">
                      Spara denna nyckel säkert!
                    </p>
                    <p className="text-yellow-700 dark:text-yellow-300">
                      Du kommer inte kunna se den igen efter att du stänger detta fönster.
                    </p>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Din API-nyckel</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type={showKey ? "text" : "password"}
                    value={createdKey}
                    readOnly
                    className="font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setShowKey(!showKey)}
                  >
                    {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(createdKey, "API-nyckel")}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleCloseCreateDialog}>Klar</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="key-name">Namn</Label>
                <Input
                  id="key-name"
                  placeholder="t.ex. Twin.so Integration"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Behörigheter</Label>
                <div className="grid gap-2">
                  {AVAILABLE_PERMISSIONS.map((perm) => (
                    <div key={perm.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={perm.id}
                        checked={selectedPermissions.includes(perm.id)}
                        onCheckedChange={() => togglePermission(perm.id)}
                      />
                      <label
                        htmlFor={perm.id}
                        className="text-sm cursor-pointer"
                      >
                        {perm.label}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={handleCloseCreateDialog}>
                  Avbryt
                </Button>
                <Button onClick={handleCreateKey} disabled={creating}>
                  {creating ? "Skapar..." : "Skapa nyckel"}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ta bort API-nyckel?</AlertDialogTitle>
            <AlertDialogDescription>
              Är du säker på att du vill ta bort nyckeln "{keyToDelete?.name}"? 
              Detta kan inte ångras och alla integrationer som använder denna nyckel kommer sluta fungera.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteKey}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Ta bort
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
