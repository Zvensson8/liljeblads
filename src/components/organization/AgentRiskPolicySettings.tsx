import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { useAgentPolicy, useSaveAgentPolicy } from '@/hooks/useAgentPolicy';
import {
  DEFAULT_AGENT_POLICY,
  POLICY_COMPONENT_TYPE_OPTIONS,
  type AgentRiskPolicy,
} from '@/lib/agentPolicy';
import type { Confidence, RiskLevel } from '@/lib/componentRisk';
import { Loader2, Shield } from 'lucide-react';

interface AgentRiskPolicySettingsProps {
  organizationId: string;
  canEdit?: boolean;
}

export function AgentRiskPolicySettings({
  organizationId,
  canEdit = true,
}: AgentRiskPolicySettingsProps) {
  const { data: policy, isLoading } = useAgentPolicy(organizationId);
  const save = useSaveAgentPolicy();
  const [draft, setDraft] = useState<AgentRiskPolicy | null>(null);

  useEffect(() => {
    if (policy) setDraft(policy);
  }, [policy]);

  if (isLoading || !draft) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const included = draft.included_component_types;
  const allTypes = included == null;

  const toggleType = (value: string, checked: boolean) => {
    setDraft((d) => {
      if (!d) return d;
      let next = d.included_component_types;
      if (next == null) {
        next = checked
          ? [value]
          : POLICY_COMPONENT_TYPE_OPTIONS.map((o) => o.value).filter((v) => v !== value);
      } else {
        next = checked
          ? [...new Set([...next, value])]
          : next.filter((t) => t !== value);
      }
      return { ...d, included_component_types: next.length ? next : [] };
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          <CardTitle>Agent & prediktiv risk</CardTitle>
        </div>
        <CardDescription>
          Styr automatiska riskförslag (cron och knappen Riskförslag). Förslag kräver alltid
          granskning om auto-skapa WO är av.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label>Aktivera riskförslag</Label>
            <p className="text-xs text-muted-foreground">
              När av stängs cron och manuella riskförslag av.
            </p>
          </div>
          <Switch
            checked={draft.risk_suggest_enabled}
            disabled={!canEdit}
            onCheckedChange={(v) => setDraft({ ...draft, risk_suggest_enabled: v })}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Minsta risknivå</Label>
            <Select
              value={draft.min_risk_level}
              disabled={!canEdit}
              onValueChange={(v) =>
                setDraft({ ...draft, min_risk_level: v as RiskLevel })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="medium">Medel och högre</SelectItem>
                <SelectItem value="high">Hög och kritisk</SelectItem>
                <SelectItem value="critical">Endast kritisk</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Minsta konfidens</Label>
            <Select
              value={draft.min_confidence}
              disabled={!canEdit}
              onValueChange={(v) =>
                setDraft({ ...draft, min_confidence: v as Confidence })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Alla (inkl. låg)</SelectItem>
                <SelectItem value="medium">Medel och högre</SelectItem>
                <SelectItem value="high">Endast hög</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Max förslag per körning</Label>
            <Input
              type="number"
              min={1}
              max={100}
              disabled={!canEdit}
              value={draft.max_suggestions_per_run}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  max_suggestions_per_run: Math.min(
                    100,
                    Math.max(1, parseInt(e.target.value || '20', 10)),
                  ),
                })
              }
            />
          </div>

          <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <div>
              <Label>Auto-skapa arbetsordrar</Label>
              <p className="text-xs text-muted-foreground">
                Avstängd rekommenderas. När på skapas WO utan granskning (framtida).
              </p>
            </div>
            <Switch
              checked={draft.auto_create_work_orders}
              disabled={!canEdit || true}
              title="Kommer i senare version"
            />
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Komponenttyper</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!canEdit}
              onClick={() =>
                setDraft({
                  ...draft,
                  included_component_types: allTypes ? [] : null,
                })
              }
            >
              {allTypes ? 'Begränsa typer…' : 'Tillåt alla typer'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {allTypes
              ? 'Alla komponenttyper får riskförslag (utom manuellt exkluderade).'
              : 'Endast markerade typer får riskförslag.'}
          </p>
          {!allTypes && (
            <div className="grid gap-2 sm:grid-cols-2">
              {POLICY_COMPONENT_TYPE_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className="flex items-center gap-2 text-sm border rounded-md px-3 py-2"
                >
                  <Checkbox
                    checked={!!included?.includes(opt.value)}
                    disabled={!canEdit}
                    onCheckedChange={(c) => toggleType(opt.value, !!c)}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          )}
        </div>

        {canEdit && (
          <div className="flex gap-2">
            <Button
              onClick={() => save.mutate(draft)}
              disabled={save.isPending}
            >
              {save.isPending ? 'Sparar…' : 'Spara policy'}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setDraft({
                  organization_id: organizationId,
                  ...DEFAULT_AGENT_POLICY,
                })
              }
            >
              Återställ standard
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
