import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@4.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const resend = new Resend(Deno.env.get('RESEND_API_KEY') as string);

interface WorkOrder {
  id: string;
  action: string;
  status: string;
  priority: string;
  contractor: string | null;
  price: number | null;
  due_date: string | null;
  updated_at: string;
  properties: {
    name: string;
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Starting monthly work order summary generation...");

    const { userId, userEmail, organizationId } = await req.json();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch work orders
    const { data: workOrders, error } = await supabase
      .from('work_orders')
      .select(`
        id,
        action,
        status,
        priority,
        contractor,
        price,
        due_date,
        updated_at,
        properties(name, organization_id)
      `)
      .eq('properties.organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error("Error fetching work orders:", error);
      throw error;
    }

    // Fetch organization
    const { data: organization } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', organizationId)
      .single();

    const typedOrders = workOrders as unknown as WorkOrder[];

    // Group by status
    const byStatus = {
      not_started: typedOrders.filter(wo => wo.status === 'not_started'),
      ordered: typedOrders.filter(wo => wo.status === 'ordered'),
      in_progress: typedOrders.filter(wo => wo.status === 'in_progress'),
      completed: typedOrders.filter(wo => wo.status === 'completed'),
    };

    // Find overdue orders
    const now = new Date();
    const overdue = typedOrders.filter(wo => {
      if (!wo.due_date) return false;
      return new Date(wo.due_date) < now && wo.status !== 'completed';
    });

    // Find stale orders (not updated in 7 days)
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const stale = typedOrders.filter(wo => {
      return new Date(wo.updated_at) < sevenDaysAgo && wo.status !== 'completed';
    });

    // Calculate costs
    const totalCost = typedOrders.reduce((sum, wo) => sum + (wo.price || 0), 0);
    const completedCost = byStatus.completed.reduce((sum, wo) => sum + (wo.price || 0), 0);
    const pendingCost = totalCost - completedCost;

    const formatCurrency = (amount: number) => {
      return new Intl.NumberFormat('sv-SE', { 
        style: 'currency', 
        currency: 'SEK',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      }).format(amount);
    };

    const getStatusLabel = (status: string) => {
      const labels: Record<string, string> = {
        not_started: 'Ej påbörjad',
        ordered: 'Beställd',
        in_progress: 'Pågående',
        completed: 'Avslutad'
      };
      return labels[status] || status;
    };

    const getPriorityBadge = (priority: string) => {
      const badges: Record<string, { class: string, label: string }> = {
        low: { class: 'success', label: 'Låg' },
        medium: { class: 'warning', label: 'Medel' },
        high: { class: 'danger', label: 'Hög' }
      };
      return badges[priority] || { class: 'warning', label: priority };
    };

    const generateTableRows = (orders: WorkOrder[]) => {
      return orders.map(wo => {
        const priorityBadge = getPriorityBadge(wo.priority);
        return `
          <tr>
            <td><strong>${wo.action}</strong></td>
            <td>${wo.properties.name}</td>
            <td>${wo.contractor || '-'}</td>
            <td><span class="badge badge-${priorityBadge.class}">${priorityBadge.label}</span></td>
            <td>${wo.price ? formatCurrency(wo.price) : '-'}</td>
            <td>${wo.due_date ? new Date(wo.due_date).toLocaleDateString('sv-SE') : '-'}</td>
          </tr>
        `;
      }).join('');
    };

    const currentDate = new Date();
    const monthName = currentDate.toLocaleDateString('sv-SE', { month: 'long' });
    const year = currentDate.getFullYear();

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 0; background: #f3f4f6; }
    .container { max-width: 900px; margin: 0 auto; background: white; }
    .header { text-align: center; padding: 40px 20px; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; }
    .header h1 { margin: 0 0 10px 0; font-size: 28px; }
    .content { padding: 40px 20px; }
    .summary-box { background: #f9fafb; padding: 30px; border-radius: 8px; margin: 20px 0; }
    .stats { display: flex; flex-wrap: wrap; justify-content: space-around; gap: 20px; }
    .stat { text-align: center; flex: 1; min-width: 120px; }
    .stat-value { font-size: 32px; font-weight: bold; color: #d97706; margin-bottom: 5px; }
    .stat-label { font-size: 14px; color: #6b7280; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th { background: #f3f4f6; padding: 12px; text-align: left; font-weight: 600; color: #374151; border-bottom: 2px solid #e5e7eb; }
    td { padding: 12px; border-bottom: 1px solid #e5e7eb; font-size: 14px; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; }
    .badge-success { background: #dcfce7; color: #166534; }
    .badge-warning { background: #fef3c7; color: #92400e; }
    .badge-danger { background: #fee2e2; color: #991b1b; }
    .alert { padding: 20px; border-left: 4px solid #f59e0b; background: #fef3c7; margin: 20px 0; border-radius: 4px; }
    .footer { text-align: center; padding: 30px; background: #f9fafb; color: #6b7280; font-size: 14px; }
    h2 { color: #111827; margin-top: 30px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔧 Månatlig arbetsorderrapport</h1>
      <p>${organization?.name || 'Din organisation'} - ${monthName} ${year}</p>
    </div>
    
    <div class="content">
      <div class="summary-box">
        <h2 style="margin-top: 0;">Översikt</h2>
        <div class="stats">
          <div class="stat">
            <div class="stat-value">${typedOrders.length}</div>
            <div class="stat-label">Totalt arbetsordrar</div>
          </div>
          <div class="stat">
            <div class="stat-value">${byStatus.completed.length}</div>
            <div class="stat-label">Avslutade</div>
          </div>
          <div class="stat">
            <div class="stat-value">${overdue.length}</div>
            <div class="stat-label">Försenade</div>
          </div>
          <div class="stat">
            <div class="stat-value">${formatCurrency(totalCost)}</div>
            <div class="stat-label">Total kostnad</div>
          </div>
        </div>
      </div>

      ${overdue.length > 0 ? `
      <div class="alert">
        <h3 style="margin-top: 0; color: #92400e;">⚠️ Försenade arbetsordrar (${overdue.length})</h3>
        <table>
          <thead>
            <tr>
              <th>Åtgärd</th>
              <th>Fastighet</th>
              <th>Entreprenör</th>
              <th>Prioritet</th>
              <th>Kostnad</th>
              <th>Förfallodatum</th>
            </tr>
          </thead>
          <tbody>
            ${generateTableRows(overdue)}
          </tbody>
        </table>
      </div>
      ` : ''}

      ${stale.length > 0 ? `
      <div class="alert" style="border-left-color: #6b7280; background: #f3f4f6;">
        <h3 style="margin-top: 0; color: #374151;">📋 Kräver uppföljning (${stale.length})</h3>
        <p style="margin-bottom: 15px; color: #6b7280;">Ej uppdaterade på över 7 dagar</p>
        <table>
          <thead>
            <tr>
              <th>Åtgärd</th>
              <th>Fastighet</th>
              <th>Entreprenör</th>
              <th>Prioritet</th>
              <th>Kostnad</th>
              <th>Förfallodatum</th>
            </tr>
          </thead>
          <tbody>
            ${generateTableRows(stale)}
          </tbody>
        </table>
      </div>
      ` : ''}

      <h2>Status per kategori</h2>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 20px 0;">
        <div style="background: #fef3c7; padding: 20px; border-radius: 8px; text-align: center;">
          <div style="font-size: 36px; font-weight: bold; color: #92400e;">${byStatus.not_started.length}</div>
          <div style="color: #78350f; font-weight: 600;">Ej påbörjade</div>
        </div>
        <div style="background: #dbeafe; padding: 20px; border-radius: 8px; text-align: center;">
          <div style="font-size: 36px; font-weight: bold; color: #1e40af;">${byStatus.ordered.length}</div>
          <div style="color: #1e3a8a; font-weight: 600;">Beställda</div>
        </div>
        <div style="background: #fef3c7; padding: 20px; border-radius: 8px; text-align: center;">
          <div style="font-size: 36px; font-weight: bold; color: #b45309;">${byStatus.in_progress.length}</div>
          <div style="color: #92400e; font-weight: 600;">Pågående</div>
        </div>
        <div style="background: #dcfce7; padding: 20px; border-radius: 8px; text-align: center;">
          <div style="font-size: 36px; font-weight: bold; color: #166534;">${byStatus.completed.length}</div>
          <div style="color: #14532d; font-weight: 600;">Avslutade</div>
        </div>
      </div>
    </div>
    
    <div class="footer">
      <p>Detta är en automatisk rapport från ${organization?.name || 'ditt system'}</p>
      <p style="font-size: 12px; color: #9ca3af;">Genererad ${currentDate.toLocaleDateString('sv-SE')} ${currentDate.toLocaleTimeString('sv-SE')}</p>
    </div>
  </div>
</body>
</html>
    `;

    await resend.emails.send({
      from: 'Arbetsorderrapporter <onboarding@resend.dev>',
      to: [userEmail],
      subject: `Månatlig arbetsorderrapport - ${monthName} ${year}`,
      html: emailHtml,
    });

    console.log(`Work order summary sent to ${userEmail}`);

    return new Response(
      JSON.stringify({ success: true, message: 'Work order summary sent' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error: any) {
    console.error('Error in send-monthly-workorder-summary:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
