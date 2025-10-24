import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Starting report preview generation...");

    const { reportType, userId } = await req.json();

    if (!reportType || !userId) {
      throw new Error('Missing reportType or userId');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user info
    const { data: profile } = await supabase
      .from('profiles')
      .select('email, organization_id')
      .eq('id', userId)
      .single();

    if (!profile || !profile.organization_id) {
      throw new Error('User profile or organization not found');
    }

    // Get organization
    const { data: organization } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', profile.organization_id)
      .single();

    let htmlPreview = '';

    // Generate preview based on report type
    switch (reportType) {
      case 'project_summary':
        htmlPreview = await generateProjectSummaryPreview(supabase, profile.organization_id, organization?.name);
        break;
      case 'workorder_summary':
        htmlPreview = await generateWorkOrderSummaryPreview(supabase, profile.organization_id, organization?.name);
        break;
      case 'maintenance_reminders':
        htmlPreview = await generateMaintenanceRemindersPreview(supabase, profile.organization_id, organization?.name);
        break;
      case 'maintenance_history':
        htmlPreview = await generateMaintenanceHistoryPreview(supabase, profile.organization_id, organization?.name);
        break;
      default:
        throw new Error('Invalid report type');
    }

    // Update preview status
    const previewField = `${reportType}_previewed`;
    await supabase
      .from('user_notification_preferences')
      .upsert({
        user_id: userId,
        organization_id: profile.organization_id,
        [previewField]: true
      }, { onConflict: 'user_id,organization_id' });

    return new Response(
      JSON.stringify({ success: true, html: htmlPreview }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error: any) {
    console.error('Error in preview-report:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

async function generateProjectSummaryPreview(supabase: any, organizationId: string, orgName: string | undefined) {
  // Simplified version - just show structure with sample data
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 20px; background: #f3f4f6; }
    .container { max-width: 900px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; }
    .header { text-align: center; padding: 40px 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; }
    .content { padding: 40px 20px; }
    .summary-box { background: #f9fafb; padding: 30px; border-radius: 8px; margin: 20px 0; }
    .stats { display: flex; flex-wrap: wrap; justify-content: space-around; gap: 20px; }
    .stat { text-align: center; flex: 1; min-width: 150px; }
    .stat-value { font-size: 32px; font-weight: bold; color: #2563eb; }
    .stat-label { font-size: 14px; color: #6b7280; margin-top: 5px; }
    .preview-badge { background: #fef3c7; color: #92400e; padding: 8px 16px; border-radius: 20px; font-size: 14px; display: inline-block; margin-bottom: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📊 Månatlig projektsammanfattning</h1>
      <p>${orgName || 'Din organisation'}</p>
    </div>
    <div class="content">
      <div class="preview-badge">👁️ Detta är en förhandsvisning</div>
      <div class="summary-box">
        <h2 style="margin-top: 0;">Översikt</h2>
        <div class="stats">
          <div class="stat">
            <div class="stat-value">-</div>
            <div class="stat-label">Pågående projekt</div>
          </div>
          <div class="stat">
            <div class="stat-value">-</div>
            <div class="stat-label">Total budget</div>
          </div>
          <div class="stat">
            <div class="stat-value">-</div>
            <div class="stat-label">Utfall hittills</div>
          </div>
        </div>
      </div>
      <p style="text-align: center; color: #6b7280; padding: 40px 0;">
        När rapporten aktiveras kommer den att innehålla dina faktiska projektdata,<br>
        grupperade per status och fastighet med detaljerad budgetuppföljning.
      </p>
    </div>
  </div>
</body>
</html>
  `;
}

async function generateWorkOrderSummaryPreview(supabase: any, organizationId: string, orgName: string | undefined) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 20px; background: #f3f4f6; }
    .container { max-width: 900px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; }
    .header { text-align: center; padding: 40px 20px; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; }
    .content { padding: 40px 20px; }
    .preview-badge { background: #fef3c7; color: #92400e; padding: 8px 16px; border-radius: 20px; font-size: 14px; display: inline-block; margin-bottom: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔧 Månatlig arbetsorderrapport</h1>
      <p>${orgName || 'Din organisation'}</p>
    </div>
    <div class="content">
      <div class="preview-badge">👁️ Detta är en förhandsvisning</div>
      <p style="text-align: center; color: #6b7280; padding: 40px 0;">
        Rapporten kommer att visa alla arbetsordrar grupperade per status,<br>
        highlighta försenade ordrar och visa kostnadsuppföljning per fastighet.
      </p>
    </div>
  </div>
</body>
</html>
  `;
}

async function generateMaintenanceRemindersPreview(supabase: any, organizationId: string, orgName: string | undefined) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 20px; background: #f3f4f6; }
    .container { max-width: 900px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; }
    .header { text-align: center; padding: 40px 20px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; }
    .content { padding: 40px 20px; }
    .preview-badge { background: #fef3c7; color: #92400e; padding: 8px 16px; border-radius: 20px; font-size: 14px; display: inline-block; margin-bottom: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔔 Underhållspåminnelser</h1>
      <p>${orgName || 'Din organisation'}</p>
    </div>
    <div class="content">
      <div class="preview-badge">👁️ Detta är en förhandsvisning</div>
      <p style="text-align: center; color: #6b7280; padding: 40px 0;">
        Veckopåminnelser om komponenter som behöver underhåll inom 30 dagar<br>
        samt garantier som går ut inom 90 dagar.
      </p>
    </div>
  </div>
</body>
</html>
  `;
}

async function generateMaintenanceHistoryPreview(supabase: any, organizationId: string, orgName: string | undefined) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 20px; background: #f3f4f6; }
    .container { max-width: 900px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; }
    .header { text-align: center; padding: 40px 20px; background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); color: white; }
    .content { padding: 40px 20px; }
    .preview-badge { background: #fef3c7; color: #92400e; padding: 8px 16px; border-radius: 20px; font-size: 14px; display: inline-block; margin-bottom: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📊 Årlig underhållshistorik</h1>
      <p>${orgName || 'Din organisation'}</p>
    </div>
    <div class="content">
      <div class="preview-badge">👁️ Detta är en förhandsvisning</div>
      <p style="text-align: center; color: #6b7280; padding: 40px 0;">
        Årlig sammanfattning av allt underhåll med kostnadsanalys per kategori,<br>
        mest underhållna komponenter och rekommendationer för kommande år.<br>
        <strong>Skickas automatiskt 1 januari varje år.</strong>
      </p>
    </div>
  </div>
</body>
</html>
  `;
}
