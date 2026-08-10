/**
 * JWT multi-org isolation tests.
 *
 * Creates two users (via Admin Auth API when service role is available),
 * two orgs, one property in Org A, and asserts User B cannot read it.
 *
 * Env (from .env / .secrets.local):
 *   VITE_SUPABASE_URL or SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY
 *   VITE_SUPABASE_PUBLISHABLE_KEY (anon/publishable for user clients)
 *
 * Skip (exit 0) if service role is missing — CI can still run typecheck/unit.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { randomBytes } from 'crypto';

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 0) continue;
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnvFile(resolve(process.cwd(), '.env'));
loadEnvFile(resolve(process.cwd(), '.secrets.local'));

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';
const anon =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  '';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  if (!url || !serviceKey || !anon) {
    console.log(
      'SKIP test-jwt-org-isolation: need SUPABASE_URL, service role key, and publishable/anon key',
    );
    process.exit(0);
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const suffix = randomBytes(4).toString('hex');
  const password = `Test-${randomBytes(8).toString('hex')}!Aa1`;
  const emailA = `iso-a-${suffix}@example.com`;
  const emailB = `iso-b-${suffix}@example.com`;

  const createdUserIds = [];

  try {
    const { data: userAData, error: createAErr } = await admin.auth.admin.createUser({
      email: emailA,
      password,
      email_confirm: true,
      user_metadata: { full_name: 'Isolation A' },
    });
    assert(!createAErr && userAData.user, `create user A: ${createAErr?.message}`);
    createdUserIds.push(userAData.user.id);

    const { data: userBData, error: createBErr } = await admin.auth.admin.createUser({
      email: emailB,
      password,
      email_confirm: true,
      user_metadata: { full_name: 'Isolation B' },
    });
    assert(!createBErr && userBData.user, `create user B: ${createBErr?.message}`);
    createdUserIds.push(userBData.user.id);

    const clientA = createClient(url, anon, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const clientB = createClient(url, anon, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { error: signAErr } = await clientA.auth.signInWithPassword({
      email: emailA,
      password,
    });
    assert(!signAErr, `sign in A: ${signAErr?.message}`);

    const { error: signBErr } = await clientB.auth.signInWithPassword({
      email: emailB,
      password,
    });
    assert(!signBErr, `sign in B: ${signBErr?.message}`);

    // Bootstrap or create orgs
    const { data: orgARes, error: orgAErr } = await clientA.rpc('create_organization', {
      p_name: `Org A ${suffix}`,
    });
    assert(!orgAErr, `create org A: ${orgAErr?.message}`);
    const orgAId = orgARes?.organization_id;
    assert(orgAId, 'org A id missing');

    const { data: orgBRes, error: orgBErr } = await clientB.rpc('create_organization', {
      p_name: `Org B ${suffix}`,
    });
    assert(!orgBErr, `create org B: ${orgBErr?.message}`);
    const orgBId = orgBRes?.organization_id;
    assert(orgBId, 'org B id missing');
    assert(orgAId !== orgBId, 'org ids must differ');

    // User A creates property in Org A
    const { data: propA, error: propErr } = await clientA
      .from('properties')
      .insert({
        name: `Property A ${suffix}`,
        organization_id: orgAId,
        owner_id: userAData.user.id,
      })
      .select('id, organization_id')
      .single();
    assert(!propErr && propA, `create property A: ${propErr?.message}`);

    // User B must NOT see property A when listing with org filter
    const { data: bList, error: bListErr } = await clientB
      .from('properties')
      .select('id, name, organization_id')
      .eq('organization_id', orgAId);
    assert(!bListErr, `list as B: ${bListErr?.message}`);
    assert(
      !bList?.some((p) => p.id === propA.id),
      'User B must not see Org A property (RLS leak)',
    );

    // User B list own org should not include prop A
    const { data: bOwn, error: bOwnErr } = await clientB
      .from('properties')
      .select('id')
      .eq('organization_id', orgBId);
    assert(!bOwnErr, `list B own: ${bOwnErr?.message}`);
    assert(!bOwn?.some((p) => p.id === propA.id), 'prop A leaked into org B list');

    // User A sees own property
    const { data: aList, error: aListErr } = await clientA
      .from('properties')
      .select('id')
      .eq('organization_id', orgAId);
    assert(!aListErr, `list A: ${aListErr?.message}`);
    assert(aList?.some((p) => p.id === propA.id), 'User A should see own property');

    // set_active_organization roundtrip for A
    const { error: switchErr } = await clientA.rpc('set_active_organization', {
      p_organization_id: orgAId,
    });
    assert(!switchErr, `set_active_organization: ${switchErr?.message}`);

    // Invite B to A and accept
    const { data: inv, error: invErr } = await clientA
      .from('organization_invitations')
      .insert({
        organization_id: orgAId,
        email: emailB.toLowerCase(),
        role: 'member',
        invited_by: userAData.user.id,
      })
      .select('token')
      .single();
    assert(!invErr && inv?.token, `invite: ${invErr?.message}`);

    const { data: acceptRes, error: acceptErr } = await clientB.rpc(
      'accept_organization_invitation',
      { p_token: inv.token },
    );
    assert(!acceptErr, `accept invite: ${acceptErr?.message}`);
    assert(acceptRes?.organization_id === orgAId, 'accept should set org A');

    // After accept, B can see property A when active on A
    const { data: bAfter, error: bAfterErr } = await clientB
      .from('properties')
      .select('id')
      .eq('organization_id', orgAId);
    assert(!bAfterErr, `list after accept: ${bAfterErr?.message}`);
    assert(
      bAfter?.some((p) => p.id === propA.id),
      'User B should see Org A property after accepting invite',
    );

    // B switches back to B — must not see A property under org B filter
    await clientB.rpc('set_active_organization', { p_organization_id: orgBId });
    const { data: bBack } = await clientB
      .from('properties')
      .select('id')
      .eq('organization_id', orgBId);
    assert(
      !bBack?.some((p) => p.id === propA.id),
      'After switch to B, org B filter must not include prop A',
    );

    console.log('✓ JWT multi-org isolation tests passed');
  } finally {
    // Cleanup users (cascades memberships where FK allows)
    for (const id of createdUserIds) {
      try {
        await admin.auth.admin.deleteUser(id);
      } catch {
        /* ignore */
      }
    }
  }
}

main().catch((e) => {
  console.error('✗ JWT isolation test failed:', e.message || e);
  process.exit(1);
});
