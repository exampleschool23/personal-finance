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
const householdRoles = ['member', 'viewer'] as const;
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
 /** Who these records belong to; null shares them with the household. */
 attribute: z.object({ ids: z.array(uuid).min(1).max(500), member: uuid.nullable() }),
 /** Who an account belongs to; the records that followed it move too. */
 account_owner: z.object({ account: uuid, member: uuid.nullable() }),
};
export type HouseholdAction = keyof typeof householdSchemas;

/** Messages the database raises that the person can act on; anything else is a generic failure. */
const householdMessages = [
 'A household has up to six people.',
 'Choose what they can do.',
 'This invite link is no longer valid. Ask for a new one.',
 'This invite is for your own household.',
 'You already belong to this household.',
 'This person is no longer in your household.',
 'Only the owner can remove someone else.',
 'You no longer have access to this shared workspace.',
 'This shared workspace is view-only.',
 'Choose one of your accounts.',
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

/** The whole household, as the owner of an account or a transaction. */
export const SHARED = 'shared';
type Owned = { shared?: boolean | null; member_id?: string | null };
type Household = Pick<HouseholdState, 'active' | 'people'>;
/** Who a record belongs to: one person of the household, or everyone (`SHARED`). Records from before owners,
 * and those of someone who has left, are shared. Mirrors `public.record_owner`. */
export function ownerOf(record: Owned, household: Household) {
 if (record.shared !== false) return SHARED;
 const person = record.member_id ?? household.active;
 return household.people.some(item => item.id === person) ? person : SHARED;
}
/** An investment account names its one owner; without one it is shared. */
export const holdingOwner = (account: { member_id?: string | null }, household: Household) => ownerOf({ shared: !account.member_id, member_id: account.member_id }, household);
/** The owners a list is narrowed to: people's ids and `SHARED`. Empty means everyone. */
export type OwnerFilter = readonly string[];
export const inOwnerFilter = (filter: OwnerFilter, owner: string) => !filter.length || filter.includes(owner);
/** The owners to choose from, shared first: for filters, pickers and the Edit owners list. */
export const ownerChoices = (household: Household, labels: { shared: string; unnamed: string }) =>
 [{ id: SHARED, name: labels.shared }, ...household.people.map(person => ({ id: person.id, name: person.name ?? labels.unnamed }))];
/** The owner fields a record is saved with. A shared record keeps naming who added it. */
export const ownedBy = (owner: string) => owner === SHARED ? { shared: true } : { shared: false, member_id: owner };
/** The person the database is told: null shares the record. */
export const ownerMember = (owner: string) => owner === SHARED ? null : owner;

/** Gives records to an owner; the sample workspace's copy of `public.set_record_owner`. */
export function assignOwner<T extends Owned & { id: string }>(records: readonly T[], ids: readonly string[], owner: string, household: Household) {
 const wanted = new Set(ids);
 let changed = 0;
 const next = records.map(record => {
  if (!wanted.has(record.id) || ownerOf(record, household) === owner) return record;
  changed++;
  return { ...record, ...ownedBy(owner) };
 });
 return { records: next, changed };
}

type OwnedRecord = Owned & { id: string; kind: string; account_id?: string | null; holding_account_id?: string | null; income_source_id?: string | null };
/** An account changes owner and takes along the records that followed it: a cash account's transactions, a property's
 * rent, an investment account's holdings. The sample workspace's copy of `public.set_account_owner`. */
export function moveAccountToOwner<T extends OwnedRecord, A extends { id: string; member_id?: string | null }>(records: readonly T[], accounts: readonly A[], accountId: string, owner: string, household: Household) {
 const account = records.find(record => record.id === accountId), holding = account ? undefined : accounts.find(item => item.id === accountId);
 const before = account ? ownerOf(account, household) : holding ? holdingOwner(holding, household) : owner;
 if (before === owner) return { records: [...records], accounts: [...accounts], changed: 0 };
 const follows = (record: T) => (account ? record.account_id === accountId || (account.kind === 'Property' && record.kind === 'Rent income' && record.income_source_id === accountId) : record.holding_account_id === accountId)
  && ownerOf(record, household) === before;
 let changed = 0;
 const next = records.map(record => {
  if (record.id === accountId) return { ...record, ...ownedBy(owner) };
  if (!follows(record)) return record;
  changed++;
  return { ...record, ...ownedBy(owner) };
 });
 return { records: next, accounts: accounts.map(item => item.id === accountId ? { ...item, member_id: ownerMember(owner) } : item), changed };
}

/** The owner fields that change when a transaction moves to another account: it takes that account's owner,
 * unless its owner was chosen by hand (it differs from the old account's). Empty when nothing changes. */
export function accountOwnerChange(entry: Owned & { account_id?: string | null }, accountId: string | null, records: ReadonlyArray<Owned & { id: string }>, household: Household) {
 const of = (id: string | null | undefined) => { const account = records.find(record => record.id === id); return account ? ownerOf(account, household) : SHARED; };
 const before = of(entry.account_id), after = of(accountId);
 return ownerOf(entry, household) === before && after !== before ? ownedBy(after) : {};
}

/** The sample workspace's household: the visitor and a partner, so owners and their filters can be tried. */
export const demoPeople = { me: 'demo-person-alex', partner: 'demo-person-sam' } as const;
export const demoHousehold: HouseholdState = {
 me: demoPeople.me, name: 'Alex', active: demoPeople.me, role: 'owner',
 people: [{ id: demoPeople.me, name: 'Alex', role: 'owner' }, { id: demoPeople.partner, name: 'Sam', role: 'member' }],
 members: [{ id: demoPeople.partner, name: 'Sam', role: 'member', joined_at: '2026-01-01T00:00:00Z' }], invites: [], memberships: [],
};

/** Sharing exists only once someone else is in the workspace. */
export const sharedWorkspace = (state: Pick<HouseholdState, 'people'> | null | undefined) => (state?.people.length ?? 0) > 1;
export const canEdit = (state: Pick<HouseholdState, 'role'> | null | undefined) => !state || state.role !== 'viewer';
