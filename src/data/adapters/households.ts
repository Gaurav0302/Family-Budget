import { supabase } from './supabase';

/** Households (D37): who belongs where. Only used with the shared database, never in the demo. */

export interface Household { id: string; name: string; plan: string; role: 'owner' | 'member' }
export interface Member { userId: string; email: string | null; role: 'owner' | 'member'; added: string }
export interface Invite { code: string; email: string | null; created: string; expires: string }

async function run<T>(p: PromiseLike<{ data: T; error: any }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message || 'The database refused the request.');
  return data;
}

/** The household of whoever is signed in, or null if they haven't started or joined one yet. */
export async function myHousehold(userId: string): Promise<Household | null> {
  const m = await run(supabase().from('members').select('household_id, role').eq('user_id', userId).maybeSingle());
  if (!m) return null;
  const hh = await run(supabase().from('households').select('id, name, plan').eq('id', (m as any).household_id).maybeSingle());
  if (!hh) return null;
  return { id: (hh as any).id, name: (hh as any).name, plan: (hh as any).plan, role: (m as any).role };
}

/** What an invitation link is for (null if the code is wrong, used or out of date). */
export async function inviteDetails(code: string): Promise<{ name: string; by: string | null } | null> {
  const rows = (await run(supabase().rpc('invite_details', { p_code: code }))) as any[];
  const r = rows?.[0];
  return r ? { name: r.household_name, by: r.invited_by } : null;
}

/** The link that lets someone join: it carries the invitation's secret code. */
export const inviteLink = (code: string) => `${location.origin}${location.pathname}#/join?code=${code}`;

/** An invitation code kept while someone signs up or confirms their email (from opening an invitation link). */
export const PENDING_INVITE = 'fb:invite';
export const codeFrom = (text: string) => text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0]?.toLowerCase() ?? null;

export const createHousehold = async (name: string) => (await run(supabase().rpc('create_household', { p_name: name }))) as string;
export const acceptInvite = async (code: string) => (await run(supabase().rpc('accept_invite', { p_code: code }))) as string;
export const leaveHousehold = async () => { await run(supabase().rpc('leave_household')); };
export const deleteHousehold = async () => { await run(supabase().rpc('delete_household')); };
export const removeMember = async (userId: string) => { await run(supabase().rpc('remove_member', { p_user: userId })); };

export async function members(householdId: string): Promise<Member[]> {
  const rows = (await run(supabase().from('members').select('user_id, email, role, added').eq('household_id', householdId).order('added'))) as any[];
  return rows.map((r) => ({ userId: r.user_id, email: r.email, role: r.role, added: r.added }));
}
export async function invites(householdId: string): Promise<Invite[]> {
  const rows = (await run(supabase().from('invites').select('code, email, created, expires').eq('household_id', householdId).gt('expires', new Date().toISOString()).order('created'))) as any[];
  return rows.map((r) => ({ code: r.code, email: r.email, created: r.created, expires: r.expires }));
}
/** A new invitation; returns its code. `email` only labels it for the owner. */
export async function invite(householdId: string, email: string): Promise<string> {
  const row = await run(supabase().from('invites').insert({ household_id: householdId, email: email.trim().toLowerCase() || null }).select('code').single());
  return (row as any).code;
}
export async function cancelInvite(code: string) {
  await run(supabase().from('invites').delete().eq('code', code));
}
export async function renameHousehold(householdId: string, name: string) {
  await run(supabase().from('households').update({ name }).eq('id', householdId));
}
