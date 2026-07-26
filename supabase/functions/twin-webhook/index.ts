import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-api-key",
};

// Supported actions
type ActionType =
  | "create_work_order"
  | "create_todo"
  | "create_project"
  | "update_work_order_status"
  | "get_pending_actions"
  | "execute_action"
  | "list_properties"
  | "list_components";

interface WebhookRequest {
  action: ActionType;
  data?: Record<string, any>;
}

interface ApiKeyData {
  id: string;
  organization_id: string;
  permissions: string[];
  is_active: boolean;
  expires_at: string | null;
}

// Hash function using Web Crypto API
async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Validate JWT token and return organization context
async function validateJwtToken(
  supabase: any,
  authHeader: string
): Promise<{ organizationId: string; userId: string } | null> {
  try {
    const token = authHeader.replace("Bearer ", "");

    // Verify JWT with getUser
    const { data: userData, error: userError } = await supabase.auth.getUser(token);

    if (userError || !userData?.user?.id) {
      console.error("JWT validation failed:", userError);
      return null;
    }

    // Get user's organization from profile
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", userData.user.id)
      .single();

    if (profileError || !profile?.organization_id) {
      console.error("Profile lookup failed:", profileError);
      return null;
    }

    return {
      organizationId: profile.organization_id,
      userId: userData.user.id,
    };
  } catch (error) {
    console.error("JWT validation error:", error);
    return null;
  }
}

// Validate API key and return organization context
async function validateApiKey(
  supabase: any,
  apiKey: string
): Promise<ApiKeyData | null> {
  const keyHash = await hashApiKey(apiKey);

  const { data, error } = await supabase
    .from("api_keys")
    .select("id, organization_id, permissions, is_active, expires_at")
    .eq("key_hash", keyHash)
    .single();

  if (error || !data) {
    console.error("API key lookup failed:", error);
    return null;
  }

  // Check if key is active
  if (!data.is_active) {
    console.log("API key is inactive");
    return null;
  }

  // Check expiration
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    console.log("API key has expired");
    return null;
  }

  // Update last_used_at
  await supabase
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id);

  return data as ApiKeyData;
}

// Check if action is permitted
function hasPermission(apiKeyData: ApiKeyData, action: ActionType): boolean {
  const permissions = apiKeyData.permissions || [];
  return permissions.includes(action);
}

// Log action to ai_suggested_actions
async function logAction(
  supabase: any,
  organizationId: string,
  actionType: string,
  payload: Record<string, any>,
  result: Record<string, any>,
  success: boolean,
  error?: string
) {
  await supabase.from("ai_suggested_actions").insert({
    organization_id: organizationId,
    action_type: actionType,
    payload: payload,
    source_document_type: "twin_webhook",
    status: success ? "executed" : "rejected",
    executed_at: success ? new Date().toISOString() : null,
    execution_result: success ? result : null,
    execution_error: error || null,
    confidence_score: 1.0,
    reasoning: "External API call via Twin.so webhook",
  });
}

// Resolve property by ID or name
async function resolveProperty(
  supabase: any,
  organizationId: string,
  propertyIdOrName: string
): Promise<{ id: string; name: string } | null> {
  // Try by ID first
  const { data: dataById } = await supabase
    .from("properties")
    .select("id, name")
    .eq("organization_id", organizationId)
    .eq("id", propertyIdOrName)
    .single();

  if (dataById) return dataById;

  // Try by name (case-insensitive)
  const { data: dataByName } = await supabase
    .from("properties")
    .select("id, name")
    .eq("organization_id", organizationId)
    .ilike("name", propertyIdOrName)
    .limit(1)
    .single();

  return dataByName;
}

// Action handlers
async function handleCreateWorkOrder(
  supabase: any,
  organizationId: string,
  data: Record<string, any>
) {
  const property = await resolveProperty(
    supabase,
    organizationId,
    data.property_id || data.property_name
  );

  if (!property) {
    throw new Error(
      `Property not found: ${data.property_id || data.property_name}`
    );
  }

  const workOrder = {
    property_id: property.id,
    action: data.title || data.action || "Arbetsorder via Twin.so",
    description: data.description || "",
    priority: data.priority || "medium",
    status: "not_started",
    due_date: data.due_date || null,
    contractor: data.contractor || null,
    comments: data.comments || "Skapad via Twin.so integration",
  };

  const { data: created, error } = await supabase
    .from("work_orders")
    .insert(workOrder)
    .select()
    .single();

  if (error) throw error;

  return { id: created.id, type: "work_order", property: property.name };
}

async function handleCreateTodo(
  supabase: any,
  organizationId: string,
  data: Record<string, any>
) {
  const property = await resolveProperty(
    supabase,
    organizationId,
    data.property_id || data.property_name
  );

  if (!property) {
    throw new Error(
      `Property not found: ${data.property_id || data.property_name}`
    );
  }

  const todo = {
    property_id: property.id,
    title: data.title || "Todo via Twin.so",
    description: data.description || "",
    priority: data.priority || "medium",
    category: data.category || "övrigt",
    due_date: data.due_date || null,
    completed: false,
  };

  const { data: created, error } = await supabase
    .from("property_todos")
    .insert(todo)
    .select()
    .single();

  if (error) throw error;

  return { id: created.id, type: "todo", property: property.name };
}

async function handleCreateProject(
  supabase: any,
  organizationId: string,
  data: Record<string, any>
) {
  const property = await resolveProperty(
    supabase,
    organizationId,
    data.property_id || data.property_name
  );

  if (!property) {
    throw new Error(
      `Property not found: ${data.property_id || data.property_name}`
    );
  }

  const project = {
    property_id: property.id,
    name: data.name || data.title || "Projekt via Twin.so",
    description: data.description || "",
    type: data.type || "renovation",
    status: "planering",
    budget: data.budget || 0,
    start_date: data.start_date || null,
    end_date: data.end_date || null,
  };

  const { data: created, error } = await supabase
    .from("projects")
    .insert(project)
    .select()
    .single();

  if (error) throw error;

  return { id: created.id, type: "project", property: property.name };
}

async function handleUpdateWorkOrderStatus(
  supabase: any,
  organizationId: string,
  data: Record<string, any>
) {
  if (!data.work_order_id) {
    throw new Error("work_order_id is required");
  }

  if (!data.status) {
    throw new Error("status is required");
  }

  // Verify work order belongs to organization
  const { data: workOrder, error: fetchError } = await supabase
    .from("work_orders")
    .select("id, property:properties!inner(organization_id)")
    .eq("id", data.work_order_id)
    .single();

  if (fetchError || !workOrder) {
    throw new Error(`Work order not found: ${data.work_order_id}`);
  }

  if (workOrder.property?.organization_id !== organizationId) {
    throw new Error("Work order does not belong to your organization");
  }

  const { error } = await supabase
    .from("work_orders")
    .update({ status: data.status, updated_at: new Date().toISOString() })
    .eq("id", data.work_order_id);

  if (error) throw error;

  return {
    id: data.work_order_id,
    type: "work_order",
    new_status: data.status,
  };
}

async function handleGetPendingActions(
  supabase: any,
  organizationId: string
) {
  const { data, error } = await supabase
    .from("ai_suggested_actions")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw error;

  return { actions: data, count: data?.length || 0 };
}

async function handleExecuteAction(
  supabase: any,
  organizationId: string,
  data: Record<string, any>
) {
  if (!data.action_id) {
    throw new Error("action_id is required");
  }

  // Get the pending action
  const { data: action, error: fetchError } = await supabase
    .from("ai_suggested_actions")
    .select("*")
    .eq("id", data.action_id)
    .eq("organization_id", organizationId)
    .eq("status", "pending")
    .single();

  if (fetchError || !action) {
    throw new Error(`Pending action not found: ${data.action_id}`);
  }

  // Execute based on action type
  let result;
  switch (action.action_type) {
    case "create_work_order":
      result = await handleCreateWorkOrder(
        supabase,
        organizationId,
        action.payload as Record<string, any>
      );
      break;
    case "create_todo":
      result = await handleCreateTodo(
        supabase,
        organizationId,
        action.payload as Record<string, any>
      );
      break;
    case "create_project":
      result = await handleCreateProject(
        supabase,
        organizationId,
        action.payload as Record<string, any>
      );
      break;
    default:
      throw new Error(`Unsupported action type: ${action.action_type}`);
  }

  // Update action status
  await supabase
    .from("ai_suggested_actions")
    .update({
      status: "executed",
      executed_at: new Date().toISOString(),
      execution_result: result,
    })
    .eq("id", data.action_id);

  return { executed_action_id: data.action_id, result };
}

async function handleListProperties(
  supabase: any,
  organizationId: string
) {
  const { data, error } = await supabase
    .from("properties")
    .select("id, name, address, city, property_number")
    .eq("organization_id", organizationId)
    .order("name");

  if (error) throw error;

  return { properties: data, count: data?.length || 0 };
}

async function handleListComponents(
  supabase: any,
  organizationId: string,
  data: Record<string, any>
) {
  let query = supabase
    .from("components")
    .select(
      "id, name, type, status, manufacturer, model, serial_number, property:properties!inner(id, name, organization_id)"
    )
    .eq("properties.organization_id", organizationId);

  if (data.property_id) {
    query = query.eq("property_id", data.property_id);
  }

  if (data.type) {
    query = query.eq("type", data.type);
  }

  const { data: components, error } = await query.limit(100);

  if (error) throw error;

  return { components, count: components?.length || 0 };
}

// Route action to appropriate handler
async function routeAction(
  supabase: any,
  organizationId: string,
  action: ActionType,
  data: Record<string, any>
): Promise<any> {
  switch (action) {
    case "create_work_order":
      return await handleCreateWorkOrder(supabase, organizationId, data);
    case "create_todo":
      return await handleCreateTodo(supabase, organizationId, data);
    case "create_project":
      return await handleCreateProject(supabase, organizationId, data);
    case "update_work_order_status":
      return await handleUpdateWorkOrderStatus(supabase, organizationId, data);
    case "get_pending_actions":
      return await handleGetPendingActions(supabase, organizationId);
    case "execute_action":
      return await handleExecuteAction(supabase, organizationId, data);
    case "list_properties":
      return await handleListProperties(supabase, organizationId);
    case "list_components":
      return await handleListComponents(supabase, organizationId, data);
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Only allow POST
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ success: false, error: "Method not allowed" }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client with service role for validation
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get authentication headers
    const apiKey = req.headers.get("x-api-key");
    const authHeader = req.headers.get("authorization");

    let organizationId: string;
    let authMethod: "api_key" | "jwt";

    // Try API key first, then JWT
    if (apiKey) {
      // Validate API key
      const apiKeyData = await validateApiKey(supabase, apiKey);
      if (!apiKeyData) {
        return new Response(
          JSON.stringify({ success: false, error: "Invalid or expired API key" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      organizationId = apiKeyData.organization_id;
      authMethod = "api_key";

      // Parse request body early to check permissions
      const body: WebhookRequest = await req.json();
      const { action, data = {} } = body;

      if (!action) {
        return new Response(
          JSON.stringify({ success: false, error: "Missing action field" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check permission for API keys
      if (!hasPermission(apiKeyData, action)) {
        return new Response(
          JSON.stringify({
            success: false,
            error: `Permission denied for action: ${action}`,
          }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log(`Processing action: ${action} for org: ${organizationId} (auth: ${authMethod})`);

      // Route to handler
      const result = await routeAction(supabase, organizationId, action, data);

      // Log successful action (only for write operations)
      if (
        [
          "create_work_order",
          "create_todo",
          "create_project",
          "update_work_order_status",
          "execute_action",
        ].includes(action)
      ) {
        await logAction(
          supabase,
          organizationId,
          action,
          data,
          result,
          true
        );
      }

      return new Response(JSON.stringify({ success: true, result }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else if (authHeader?.startsWith("Bearer ")) {
      // JWT authentication
      const jwtData = await validateJwtToken(supabase, authHeader);
      if (!jwtData) {
        return new Response(
          JSON.stringify({ success: false, error: "Invalid or expired token" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      organizationId = jwtData.organizationId;
      authMethod = "jwt";

      // Parse request body
      const body: WebhookRequest = await req.json();
      const { action, data = {} } = body;

      if (!action) {
        return new Response(
          JSON.stringify({ success: false, error: "Missing action field" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // JWT users have full access (no permission check)
      console.log(`Processing action: ${action} for org: ${organizationId} (auth: ${authMethod}, user: ${jwtData.userId})`);

      // Route to handler
      const result = await routeAction(supabase, organizationId, action, data);

      // Log successful action (only for write operations)
      if (
        [
          "create_work_order",
          "create_todo",
          "create_project",
          "update_work_order_status",
          "execute_action",
        ].includes(action)
      ) {
        await logAction(
          supabase,
          organizationId,
          action,
          data,
          result,
          true
        );
      }

      return new Response(JSON.stringify({ success: true, result }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Authentication required. Use X-API-Key header or Authorization: Bearer <jwt>",
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error) {
    console.error("Webhook error:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
