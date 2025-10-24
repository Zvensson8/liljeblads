import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@4.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const resend = new Resend(Deno.env.get('RESEND_API_KEY') as string);

interface MaintenanceRecord {
  id: string;
  action_type: string;
  performed_date: string;
  cost: number | null;
  is_warranty: boolean;
  category: string | null;
  components: {
    name: string;
    type: string;
    properties: { name: string } | null;
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Starting annual maintenance history generation...");

    const { userId, userEmail, organizationId } = await req.json();

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const lastYear = new Date().getFullYear() - 1;
    const startDate = new Date(lastYear, 0, 1);
    const endDate = new Date(lastYear, 11, 31);

    // Fetch maintenance history for last year
    const { data: maintenanceRecords, error } = await supabase
      .from('maintenance_history')
      .select(`
        id,
        action_type,
        performed_date,
        cost,
        is_warranty,
        category,
        components(
          name,
          type,
          properties(name, organization_id)
        )
      `)
      .eq('components.properties.organization_id', organizationId)
      .gte('performed_date', startDate.toISOString())
      .lte('performed_date', endDate.toISOString())
      .order('performed_date', { ascending: false });

    if (error) {
      console.error("Error fetching maintenance history:", error);
      throw error;
    }

    // Fetch organization
    const { data: organization } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', organizationId)
      .single();

    const typedRecords = maintenanceRecords as unknown as MaintenanceRecord[];

    if (typedRecords.length === 0) {
      console.log("No maintenance history for last year");
      return new Response(
        JSON.stringify({ success: true, message: 'No maintenance history' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Calculate statistics
    const totalEvents = typedRecords.length;
    const totalCost = typedRecords.reduce((sum, r) => sum + (r.cost || 0), 0);
    const warrantyCount = typedRecords.filter(r => r.is_warranty).length;
    const warrantyPercentage = totalEvents > 0 ? (warrantyCount / totalEvents * 100).toFixed(1) : '0';

    // Group by category
    const byCategory: Record<string, { count: number, cost: number }> = {};
    typedRecords.forEach(record => {
      const category = record.category || 'Övrigt';
      if (!byCategory[category]) {
        byCategory[category] = { count: 0, cost: 0 };
      }
      byCategory[category].count++;
      byCategory[category].cost += record.cost || 0;
    });

    // Most maintained components
    const componentCounts: Record<string, { count: number, cost: number, type: string }> = {};
    typedRecords.forEach(record => {
      const name = record.components.name;
      if (!componentCounts[name]) {
        componentCounts[name] = { count: 0, cost: 0, type: record.components.type };
      }
      componentCounts[name].count++;
      componentCounts[name].cost += record.cost || 0;
    });

    const topComponents = Object.entries(componentCounts)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10);

    const formatCurrency = (amount: number) => {
      return new Intl.NumberFormat('sv-SE', { 
        style: 'currency', 
        currency: 'SEK',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      }).format(amount);
    };

    const categoryRows = Object.entries(byCategory)
      .sort((a, b) => b[1].cost - a[1].cost)
      .map(([category, data]) => `
        <tr>
          <td><strong>${category}</strong></td>
          <td>${data.count}</td>
          <td>${formatCurrency(data.cost)}</td>
          <td>${formatCurrency(data.cost / data.count)}</td>
        </tr>
      `).join('');

    const topComponentRows = topComponents.map(([name, data]) => `
      <tr>
        <td><strong>${name}</strong></td>
        <td>${data.type}</td>
        <td>${data.count}</td>
        <td>${formatCurrency(data.cost)}</td>
      </tr>
    `).join('');

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 0; background: #f3f4f6; }
    .container { max-width: 900px; margin: 0 auto; background: white; }
    .header { text-align: center; padding: 40px 20px; background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); color: white; }
    .header h1 { margin: 0 0 10px 0; font-size: 28px; }
    .content { padding: 40px 20px; }
    .summary-box { background: #eef2ff; padding: 30px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #6366f1; }
    .stats { display: flex; flex-wrap: wrap; justify-content: space-around; gap: 20px; margin: 20px 0; }
    .stat { text-align: center; flex: 1; min-width: 150px; background: #f9fafb; padding: 20px; border-radius: 8px; }
    .stat-value { font-size: 36px; font-weight: bold; color: #4f46e5; margin-bottom: 5px; }
    .stat-label { font-size: 14px; color: #6b7280; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th { background: #f3f4f6; padding: 12px; text-align: left; font-weight: 600; color: #374151; border-bottom: 2px solid #e5e7eb; }
    td { padding: 12px; border-bottom: 1px solid #e5e7eb; font-size: 14px; }
    .footer { text-align: center; padding: 30px; background: #f9fafb; color: #6b7280; font-size: 14px; }
    h2 { color: #111827; margin-top: 30px; }
    .insight-box { background: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📊 Årlig underhållshistorik</h1>
      <p>${organization?.name || 'Din organisation'} - ${lastYear}</p>
    </div>
    
    <div class="content">
      <div class="summary-box">
        <h2 style="margin-top: 0; color: #4338ca;">Sammanfattning ${lastYear}</h2>
        <div class="stats">
          <div class="stat">
            <div class="stat-value">${totalEvents}</div>
            <div class="stat-label">Underhållshändelser</div>
          </div>
          <div class="stat">
            <div class="stat-value">${formatCurrency(totalCost)}</div>
            <div class="stat-label">Total kostnad</div>
          </div>
          <div class="stat">
            <div class="stat-value">${formatCurrency(totalCost / totalEvents)}</div>
            <div class="stat-label">Genomsnitt per händelse</div>
          </div>
          <div class="stat">
            <div class="stat-value">${warrantyPercentage}%</div>
            <div class="stat-label">Garantiarbeten</div>
          </div>
        </div>
      </div>

      <h2>Kostnader per kategori</h2>
      <table>
        <thead>
          <tr>
            <th>Kategori</th>
            <th>Antal händelser</th>
            <th>Total kostnad</th>
            <th>Genomsnitt</th>
          </tr>
        </thead>
        <tbody>
          ${categoryRows}
        </tbody>
      </table>

      <h2>Mest underhållna komponenter</h2>
      <table>
        <thead>
          <tr>
            <th>Komponent</th>
            <th>Typ</th>
            <th>Antal underhåll</th>
            <th>Total kostnad</th>
          </tr>
        </thead>
        <tbody>
          ${topComponentRows}
        </tbody>
      </table>

      <div class="insight-box">
        <h3 style="margin-top: 0; color: #047857;">💡 Rekommendationer för ${new Date().getFullYear()}</h3>
        <ul style="color: #065f46; line-height: 1.8;">
          <li><strong>Planerat underhåll:</strong> Baserat på förra årets data rekommenderas att budgetera cirka ${formatCurrency(totalCost * 1.1)} för underhåll i år (+10% buffert).</li>
          <li><strong>Fokusområden:</strong> De komponenter som kräver mest underhåll bör prioriteras för förebyggande åtgärder.</li>
          <li><strong>Garantiarbeten:</strong> ${warrantyPercentage}% av underhållet utfördes under garanti. Se till att utnyttja garantier innan de går ut.</li>
          <li><strong>Kostnadsoptimering:</strong> Överväg serviceavtal för komponenter med frekventa underhållsbehov.</li>
        </ul>
      </div>
    </div>
    
    <div class="footer">
      <p>Detta är en automatisk årsrapport från ${organization?.name || 'ditt system'}</p>
      <p style="font-size: 12px; color: #9ca3af;">Genererad ${new Date().toLocaleDateString('sv-SE')} ${new Date().toLocaleTimeString('sv-SE')}</p>
    </div>
  </div>
</body>
</html>
    `;

    await resend.emails.send({
      from: 'Årsrapporter <onboarding@resend.dev>',
      to: [userEmail],
      subject: `Årlig underhållshistorik ${lastYear}`,
      html: emailHtml,
    });

    console.log(`Annual maintenance history sent to ${userEmail}`);

    return new Response(
      JSON.stringify({ success: true, message: 'Annual maintenance history sent' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error: any) {
    console.error('Error in send-maintenance-history-annual:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
