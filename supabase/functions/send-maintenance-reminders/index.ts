import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@4.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const resend = new Resend(Deno.env.get('RESEND_API_KEY') as string);

interface Component {
  id: string;
  name: string;
  type: string;
  next_maintenance_date: string | null;
  properties: { name: string } | null;
  floors: { name: string } | null;
  component_purchase_info: Array<{
    purchase_date: string;
    warranty_years: number;
  }>;
  maintenance_history: Array<{
    performed_date: string;
    action_type: string;
  }>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Starting maintenance reminders generation...");

    const { userId, userEmail, organizationId } = await req.json();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysFromNow = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

    // Fetch components with upcoming maintenance
    const { data: components, error } = await supabase
      .from('components')
      .select(`
        id,
        name,
        type,
        next_maintenance_date,
        properties(name, organization_id),
        floors(name),
        component_purchase_info(purchase_date, warranty_years),
        maintenance_history(performed_date, action_type)
      `)
      .eq('properties.organization_id', organizationId)
      .not('next_maintenance_date', 'is', null)
      .lte('next_maintenance_date', thirtyDaysFromNow.toISOString())
      .order('next_maintenance_date', { ascending: true });

    if (error) {
      console.error("Error fetching components:", error);
      throw error;
    }

    // Fetch organization
    const { data: organization } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', organizationId)
      .single();

    const typedComponents = components as unknown as Component[];

    // Filter and prepare upcoming maintenance
    const upcomingMaintenance = typedComponents.map(component => {
      const nextDate = new Date(component.next_maintenance_date!);
      const daysUntil = Math.ceil((nextDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      
      const lastMaintenance = component.maintenance_history?.length > 0
        ? component.maintenance_history[0].performed_date
        : null;

      return {
        ...component,
        days_until: daysUntil,
        last_maintenance: lastMaintenance,
        urgency: daysUntil <= 7 ? 'high' : daysUntil <= 14 ? 'medium' : 'low'
      };
    });

    // Find expiring warranties
    const expiringWarranties = typedComponents
      .filter(c => c.component_purchase_info?.length > 0)
      .map(component => {
        const purchaseInfo = component.component_purchase_info[0];
        const purchaseDate = new Date(purchaseInfo.purchase_date);
        const warrantyExpires = new Date(
          purchaseDate.getTime() + purchaseInfo.warranty_years * 365 * 24 * 60 * 60 * 1000
        );
        const daysUntilExpiry = Math.ceil((warrantyExpires.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        return {
          component,
          warranty_expires: warrantyExpires,
          days_until_expiry: daysUntilExpiry
        };
      })
      .filter(item => item.days_until_expiry > 0 && item.days_until_expiry <= 90)
      .sort((a, b) => a.days_until_expiry - b.days_until_expiry);

    if (upcomingMaintenance.length === 0 && expiringWarranties.length === 0) {
      console.log("No upcoming maintenance or expiring warranties");
      return new Response(
        JSON.stringify({ success: true, message: 'No reminders needed' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    const getUrgencyBadge = (urgency: string) => {
      const badges: Record<string, { class: string, label: string }> = {
        high: { class: 'danger', label: 'Brådskande' },
        medium: { class: 'warning', label: 'Snart' },
        low: { class: 'success', label: 'Planerat' }
      };
      return badges[urgency] || badges.low;
    };

    const escapeHtml = (text: string): string => {
      return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    };

    const maintenanceRows = upcomingMaintenance.map(item => {
      const badge = getUrgencyBadge(item.urgency);
      return `
        <tr>
          <td><strong>${escapeHtml(item.name)}</strong></td>
          <td>${escapeHtml(item.type)}</td>
          <td>${escapeHtml(item.properties?.name || '-')}</td>
          <td>${escapeHtml(item.floors?.name || '-')}</td>
          <td><span class="badge badge-${badge.class}">${item.days_until} dagar</span></td>
          <td>${new Date(item.next_maintenance_date!).toLocaleDateString('sv-SE')}</td>
          <td>${item.last_maintenance ? new Date(item.last_maintenance).toLocaleDateString('sv-SE') : 'Aldrig'}</td>
        </tr>
      `;
    }).join('');

    const warrantyRows = expiringWarranties.map(item => {
      return `
        <tr>
          <td><strong>${escapeHtml(item.component.name)}</strong></td>
          <td>${escapeHtml(item.component.type)}</td>
          <td>${escapeHtml(item.component.properties?.name || '-')}</td>
          <td>${item.days_until_expiry} dagar</td>
          <td>${item.warranty_expires.toLocaleDateString('sv-SE')}</td>
        </tr>
      `;
    }).join('');

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 0; background: #f3f4f6; }
    .container { max-width: 900px; margin: 0 auto; background: white; }
    .header { text-align: center; padding: 40px 20px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; }
    .header h1 { margin: 0 0 10px 0; font-size: 28px; }
    .content { padding: 40px 20px; }
    .summary-box { background: #ecfdf5; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th { background: #f3f4f6; padding: 12px; text-align: left; font-weight: 600; color: #374151; border-bottom: 2px solid #e5e7eb; font-size: 13px; }
    td { padding: 12px; border-bottom: 1px solid #e5e7eb; font-size: 14px; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: 600; }
    .badge-success { background: #dcfce7; color: #166534; }
    .badge-warning { background: #fef3c7; color: #92400e; }
    .badge-danger { background: #fee2e2; color: #991b1b; }
    .footer { text-align: center; padding: 30px; background: #f9fafb; color: #6b7280; font-size: 14px; }
    h2 { color: #111827; margin-top: 30px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔔 Underhållspåminnelser</h1>
      <p>${organization?.name || 'Din organisation'}</p>
    </div>
    
    <div class="content">
      ${upcomingMaintenance.length > 0 ? `
      <div class="summary-box">
        <h3 style="margin-top: 0; color: #047857;">📋 ${upcomingMaintenance.length} komponenter kräver underhåll inom 30 dagar</h3>
        <p style="margin: 0; color: #065f46;">Planera in underhållsåtgärder för att säkerställa optimal drift.</p>
      </div>

      <h2>Kommande underhåll</h2>
      <table>
        <thead>
          <tr>
            <th>Komponent</th>
            <th>Typ</th>
            <th>Fastighet</th>
            <th>Våning</th>
            <th>Tid kvar</th>
            <th>Planerad datum</th>
            <th>Senaste underhåll</th>
          </tr>
        </thead>
        <tbody>
          ${maintenanceRows}
        </tbody>
      </table>
      ` : ''}

      ${expiringWarranties.length > 0 ? `
      <div style="background: #fef3c7; padding: 20px; border-radius: 8px; margin: 30px 0; border-left: 4px solid #f59e0b;">
        <h3 style="margin-top: 0; color: #92400e;">⚠️ ${expiringWarranties.length} garantier går snart ut</h3>
        <p style="margin: 0; color: #78350f;">Kontrollera om underhåll behövs innan garantin löper ut.</p>
      </div>

      <h2>Utgående garantier (inom 90 dagar)</h2>
      <table>
        <thead>
          <tr>
            <th>Komponent</th>
            <th>Typ</th>
            <th>Fastighet</th>
            <th>Tid kvar</th>
            <th>Garantin går ut</th>
          </tr>
        </thead>
        <tbody>
          ${warrantyRows}
        </tbody>
      </table>
      ` : ''}
    </div>
    
    <div class="footer">
      <p>Detta är en automatisk påminnelse från ${organization?.name || 'ditt system'}</p>
      <p style="font-size: 12px; color: #9ca3af;">Genererad ${now.toLocaleDateString('sv-SE')} ${now.toLocaleTimeString('sv-SE')}</p>
    </div>
  </div>
</body>
</html>
    `;

    await resend.emails.send({
      from: 'Underhållspåminnelser <onboarding@resend.dev>',
      to: [userEmail],
      subject: `Underhållspåminnelser - ${upcomingMaintenance.length} åtgärder behövs`,
      html: emailHtml,
    });

    const maskedEmail = userEmail.replace(/(.{2})(.*)(@.*)/, '$1***$3');
    console.log(`Maintenance reminders sent to ${maskedEmail}`);

    return new Response(
      JSON.stringify({ success: true, message: 'Maintenance reminders sent' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error: any) {
    console.error('Error in send-maintenance-reminders:', error.message || 'Unknown error');
    return new Response(
      JSON.stringify({ error: 'Failed to send maintenance reminders' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
