import type { JarvisAppliedAction } from '@/components/ai-chat/JarvisActionCards';

/**
 * When the model confirms an apply in plain text but appliedActions is empty
 * (old client, race, partial response), recover a minimal action card.
 */
export function inferAppliedActionsFromText(
  content: string,
  toolsUsed: string[] = [],
): JarvisAppliedAction[] {
  const text = content || '';
  const actions: JarvisAppliedAction[] = [];

  // Explicit UUID from Jarvis text e.g. "Arbetsorder-ID: fcb2d722-..."
  const woId =
    text.match(
      /Arbetsorder[- ]?ID[:\s]+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
    )?.[1] ||
    text.match(
      /work[_\s-]?order[_\s-]?id[:\s]+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
    )?.[1];

  const createdWo =
    /arbetsorder[n]?\s+(har\s+)?skapats|skapad\s+framgångsrikt|skapat\s+en\s+arbetsorder/i.test(
      text,
    ) || toolsUsed.includes('apply_create_work_order');

  if (createdWo || woId) {
    actions.push({
      tool: 'apply_create_work_order',
      success: true,
      summary: woId
        ? `Arbetsorder skapad (${woId.slice(0, 8)}…)`
        : 'Arbetsorder skapad',
      link: '/work-orders',
      entity_type: 'work_order',
      entity_id: woId || null,
      undoable: true,
    });
  }

  const projectId = text.match(
    /projekt[- ]?id[:\s]+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
  )?.[1];
  if (
    /projekt(et)?\s+(har\s+)?skapats|skapat\s+ett\s+projekt/i.test(text) ||
    toolsUsed.includes('apply_create_project')
  ) {
    actions.push({
      tool: 'apply_create_project',
      success: true,
      summary: 'Projekt skapat',
      link: projectId ? `/projects/${projectId}` : '/projects',
      entity_type: 'project',
      entity_id: projectId || null,
      undoable: true,
    });
  }

  if (
    /skickat\s+(till\s+dig|e-?post)|e-?post\s+skickad/i.test(text) ||
    toolsUsed.includes('send_to_me')
  ) {
    actions.push({
      tool: 'send_to_me',
      success: true,
      summary: 'Skickat till dig',
      sent: true,
      undoable: false,
    });
  }

  // Generic: any apply_* in toolsUsed not already covered
  for (const tool of toolsUsed) {
    if (!tool.startsWith('apply_')) continue;
    if (actions.some((a) => a.tool === tool)) continue;
    actions.push({
      tool,
      success: true,
      summary: 'Åtgärd utförd — kan ångras inom 5 min',
      undoable: true,
      link: tool.includes('work_order')
        ? '/work-orders'
        : tool.includes('project')
          ? '/projects'
          : null,
    });
  }

  return actions;
}

/** Merge server appliedActions with text/tools inference (server wins on conflicts). */
export function mergeAppliedActions(
  fromServer: JarvisAppliedAction[] | undefined,
  message: string,
  toolsUsed: string[] = [],
): JarvisAppliedAction[] {
  if (fromServer?.length) return fromServer;
  return inferAppliedActionsFromText(message, toolsUsed);
}
