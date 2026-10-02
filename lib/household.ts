import { z } from 'zod';

/**
 * Households: an owner shares their workspace with up to five other people.
 * The database decides who may read or change a workspace (migration 100);
 * this module holds the shared vocabulary for the API, the provider and the UI.
 */
export const householdLimit = 6;
/** The cookie naming the workspace this browser works on; absent means the person's own. */
export const workspaceCookie = 'hf_workspace';
/** The header the database reads to scope a request to that workspace. */
export const workspaceHeader = 'x-workspace-owner';
export const householdRoles = ['member', 'viewer'] as const;
export type HouseholdRole = (typeof householdRoles)[number];
export type PersonRole = HouseholdRole | 'owner';
export type HouseholdPerson = { id: string; name: string | null; role: PersonRole };
export type HouseholdInvite = { id: string; role: HouseholdRole; created_at: string; expires_at: string };
export type HouseholdMembership = { owner_id: string; name: string | null; role: HouseholdRole };
export type HouseholdState = {
 me: string;
 name: string | null;
 /** Whose workspace is open: the person's own id, or a household they belong to. */
 active: string;
 role: PersonRole;
 /** The people of the open workspace, owner first. */
 people: HouseholdPerson[];
 members: Array<HouseholdPerson & { joined_at: string }>;
 invites: HouseholdInvite[];
 memberships: HouseholdMembership[];
 /** Set when the household asked for was no longer available and the person's own workspace opened instead. */
 reset?: boolean;
};
export type InvitePreview = { owner_id: string; name: string | null; role: HouseholdRole; expires_at: string; own: boolean; joined: boolean };

const uuid = z.string().uuid();
const token = z.string().regex(/^[0-9a-f]{64}$/);
const role = z.enum(householdRoles);
export const householdSchemas = {
 invite: z.object({ role }),
 revoke: z.object({ id: uuid }),
 role: z.object({ member: uuid, role }),
 remove: z.object({ member: uuid }),
 leave: z.object({ owner: uuid }),
 preview: z.object({ token }),
 accept: z.object({ token }),
 switch: z.object({ owner: uuid.nullable() }),
 /** Who paid for these transactions. */
 attribute: z.object({ ids: z.array(uuid).min(1).max(500), member: uuid }),
};
export type HouseholdAction = keyof typeof householdSchemas;

/** Messages the database raises that the person can act on; anything else is a generic failure. */
export const householdMessages = [
 'A household has up to six people.',
 'Choose what they can do.',
 'This invite link is no longer valid. Ask for a new one.',
 'This invite is for your own household.',
 'You already belong to this household.',
 'This person is no longer in your household.',
 'Only the owner can remove someone else.',
 'You no longer have access to this shared workspace.',
 'This shared workspace is view-only.',
] as const;
export const knownHouseholdMessage = (message: unknown) => householdMessages.find(item => item === message) ?? null;

/** Request options for the signed-in person's own account (backups, sign-in, deletion), whichever workspace is open. */
export const personalRequest = (init: RequestInit = {}): RequestInit => ({ ...init, headers: { ...(init.headers as Record<string, string> | undefined), [workspaceHeader]: '' } });
/** A valid workspace cookie value, or null. */
export const workspaceId = (value: unknown) => uuid.safeParse(value).success ? value as string : null;
/** The owner whose data a signed-in request works on. The database verifies it on every query. */
export const workspaceOwner = (auth: { user: { id: string }; owner?: string | null }) => auth.owner ?? auth.user.id;

/** The invite link handed to the person being invited. */
export const inviteLink = (origin: string, value: string) => `${origin}/settings?invite=${value}#household`;
/** The invite token in a link's query, if any. */
export const inviteToken = (search: string) => { const value = new URLSearchParams(search).get('invite'); return value && token.safeParse(value).success ? value : null; };

/** One or two letters for a person's avatar. */
export function initials(name: string | null | undefined) {
 const words = (name ?? '').replace(/@.*$/, '').split(/[\s._-]+/).filter(Boolean);
 return (words.length > 1 ? words[0][0] + words[1][0] : words[0]?.slice(0, 1) ?? '?').toUpperCase();
}

export type MemberFilter = 'all' | 'mine' | 'partner';
/** Who a record belongs to: the person who paid, or the workspace owner for records from before households. */
export const recordMember = (record: { member_id?: string | null }, owner: string) => record.member_id ?? owner;
/** Mine, someone else in the household, or everyone. */
export function matchesMember(record: { member_id?: string | null }, filter: MemberFilter, me: string, owner: string) {
 if (filter === 'all') return true;
 return (recordMember(record, owner) === me) === (filter === 'mine');
}
/** Sharing exists only once someone else is in the workspace. */
export const sharedWorkspace = (state: Pick<HouseholdState, 'people'> | null | undefined) => (state?.people.length ?? 0) > 1;
export const canEdit = (state: Pick<HouseholdState, 'role'> | null | undefined) => !state || state.role !== 'viewer';
