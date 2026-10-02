"use client";
import { useEffect, useState } from 'react';
import { Copy, UserPlus, Users } from 'lucide-react';
import { useLanguage } from '@/components/language-provider';
import { ConfirmDialog } from '@/components/presentation-foundation/confirm-dialog';
import { Count } from '@/components/presentation-foundation/count';
import { EmptyState } from '@/components/presentation-foundation/empty-state';
import { ErrorPopup } from '@/components/presentation-foundation/error-popup';
import { FormFooter } from '@/components/presentation-foundation/form-footer';
import { PanelTitle } from '@/components/presentation-foundation/panel-title';
import { PersonAvatar } from '@/components/presentation-foundation/person-avatar';
import { ResourceState } from '@/components/presentation-foundation/resource-state';
import { RowMenu } from '@/components/presentation-foundation/row-menu';
import { Segmented } from '@/components/presentation-foundation/segmented';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import type { Household } from '@/hooks/use-household';
import { showError, showNotice } from '@/lib/feedback';
import { formatDate } from '@/lib/format';
import { householdLimit, type HouseholdRole } from '@/lib/household';

const roleLabel = (role: string) => role === 'owner' ? 'Owner' : role === 'viewer' ? 'Can view' : 'Can edit';

/** Settings › Household sharing: who shares your finances, open invite links, and the households you belong to. */
export function HouseholdPanel({ household, demo }: { household: Household; demo: boolean }) {
 const { t, locale } = useLanguage();
 const [inviting, setInviting] = useState(false);
 const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null);
 const [leaving, setLeaving] = useState<string | null>(null);
 const [busy, setBusy] = useState(false);
 const state = household.state;
 const name = (value: string | null | undefined) => value ?? t('Partner');
 const run = async (action: () => Promise<unknown>, done?: () => void) => {
  setBusy(true);
  try { await action(); done?.(); } catch (reason) { showError((reason as Error).message); } finally { setBusy(false); }
 };
 const people = state ? 1 + state.members.length : 1;
 return <section className="panel household-panel" aria-label={t('Household sharing')}>
  <PanelTitle title={t('Household sharing')} count={!demo && state ? <Count value={people}/> : undefined} hint={t('Share your finances with a partner or family. People who can edit add and change records; people who can view only look. Each person keeps their own sign-in, preferences, Telegram and backups.')}>
   {!demo && state && <Button disabled={people + state.invites.length >= householdLimit} onClick={() => setInviting(true)}><UserPlus size={16} aria-hidden="true"/>{t('Invite someone')}</Button>}
  </PanelTitle>
  {demo ? <EmptyState icon={<Users/>} description={t('Sharing is not available in the sample workspace.')}/> : <ResourceState loading={household.loading} error={household.error || null} onRetry={household.retry}>
   {state && <>
    <ul className="household-people">
     <li><PersonAvatar name={name(state.name)}/><strong>{name(state.name)}</strong><span className="status-badge">{t('Owner')}</span></li>
     {state.members.map(member => <li key={member.id}>
      <PersonAvatar name={name(member.name)}/><strong>{name(member.name)}</strong>
      <NativeSelect aria-label={t('Access for {name}', { name: name(member.name) })} value={member.role} disabled={busy} onChange={event => { const role = event.currentTarget.value as HouseholdRole; void run(() => household.setRole(member.id, role)); }}>
       <option value="member">{t('Can edit')}</option><option value="viewer">{t('Can view')}</option>
      </NativeSelect>
      <RowMenu label={t('Actions for {name}', { name: name(member.name) })} items={[{ label: t('Remove from household'), destructive: true, onSelect: () => setRemoving({ id: member.id, name: name(member.name) }) }]}/>
     </li>)}
     {state.invites.map(invite => <li key={invite.id} className="household-invite">
      <span className="person-avatar" aria-hidden="true"><UserPlus size={14}/></span><strong>{t('Open invite')}</strong>
      <span className="status-badge">{t(roleLabel(invite.role))}</span><small>{t('Expires {date}', { date: formatDate(invite.expires_at, locale) })}</small>
      <RowMenu label={t('Actions for {name}', { name: t('Open invite') })} items={[{ label: t('Withdraw invite'), destructive: true, onSelect: () => void run(() => household.revoke(invite.id)) }]}/>
     </li>)}
    </ul>
    {state.memberships.length > 0 && <>
     <h3 className="household-heading">{t('Households you belong to')}</h3>
     <ul className="household-people">
      {state.memberships.map(item => <li key={item.owner_id}>
       <PersonAvatar name={name(item.name)}/><strong>{t('Household of {name}', { name: name(item.name) })}</strong>
       <span className="status-badge">{t(roleLabel(item.role))}</span>
       {state.active !== item.owner_id && <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => household.open(item.owner_id))}>{t('Open')}</Button>}
       <RowMenu label={t('Actions for {name}', { name: name(item.name) })} items={[{ label: t('Leave household'), destructive: true, onSelect: () => setLeaving(item.owner_id) }]}/>
      </li>)}
     </ul>
    </>}
   </>}
  </ResourceState>}
  {inviting && <InviteDialog household={household} onClose={() => setInviting(false)}/>}
  <ConfirmDialog open={!!removing} onClose={() => setRemoving(null)} busy={busy} destructive title={t('Remove {name} from your household?', { name: removing?.name ?? '' })} description={t('They lose access straight away. Records they added stay in your workspace.')} confirmLabel={t('Remove from household')} onConfirm={() => run(() => household.remove(removing!.id), () => setRemoving(null))}/>
  <ConfirmDialog open={!!leaving} onClose={() => setLeaving(null)} busy={busy} destructive title={t('Leave this household?')} description={t('You lose access straight away. Your own finances are not affected.')} confirmLabel={t('Leave household')} onConfirm={() => run(() => household.leave(leaving!), () => setLeaving(null))}/>
 </section>;
}

/** Creates a single-use invite link for one role, then shows it once to copy and send. */
function InviteDialog({ household, onClose }: { household: Household; onClose: () => void }) {
 const { t, locale } = useLanguage();
 const [role, setRole] = useState<HouseholdRole>('member');
 const [created, setCreated] = useState<{ link: string; expires: string } | null>(null);
 const [busy, setBusy] = useState(false), [error, setError] = useState('');
 async function create() {
  setBusy(true); setError('');
  try { const result = await household.invite(role); setCreated({ link: result.link, expires: result.invite.expires_at }); }
  catch (reason) { setError(t((reason as Error).message)); } finally { setBusy(false); }
 }
 async function copy() {
  // Without clipboard access the link stays selectable in its field.
  try { await navigator.clipboard.writeText(created!.link); showNotice('Link copied'); } catch {}
 }
 return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent className="household-invite-dialog">
  <DialogTitle>{t('Invite someone')}</DialogTitle>
  <DialogDescription>{created ? t('Anyone with this link can join once until {date}. Send it only to the person you are inviting.', { date: formatDate(created.expires, locale) }) : t('Choose what they can do in your finances.')}</DialogDescription>
  {created ? <div className="household-link"><Input readOnly aria-label={t('Invite link')} value={created.link} onFocus={event => event.currentTarget.select()}/><Button type="button" onClick={() => void copy()}><Copy size={16} aria-hidden="true"/>{t('Copy link')}</Button></div>
   : <Segmented label={t('Access')} options={[{ value: 'member', label: t('Can edit') }, { value: 'viewer', label: t('Can view') }] as const} value={role} onChange={setRole}/>}
  <ErrorPopup message={error}/>
  <FormFooter busy={busy} onCancel={onClose} cancelLabel={created ? t('Done') : undefined}>{!created && <Button type="button" disabled={busy} onClick={() => void create()}>{t('Create invite link')}</Button>}</FormFooter>
 </DialogContent></Dialog>;
}

/** After following an invite link (and signing in), asks once whether to join that household. */
export function JoinHouseholdDialog({ token, household, onClose }: { token: string; household: Household; onClose: () => void }) {
 const { t } = useLanguage();
 const [invite, setInvite] = useState<Awaited<ReturnType<Household['preview']>> | null>(null);
 const [error, setError] = useState(''), [busy, setBusy] = useState(false);
 useEffect(() => {
  let current = true;
  household.preview(token).then(result => { if (current) setInvite(result); }).catch(reason => { if (current) setError((reason as Error).message); });
  return () => { current = false; };
 // The preview is read once per link.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [token]);
 useEffect(() => { if (error) { showError(error); onClose(); } }, [error, onClose]);
 if (!invite) return null;
 const owner = invite.name ?? t('Partner');
 const usable = !invite.own && !invite.joined;
 return <ConfirmDialog open onClose={onClose} busy={busy} title={t('Join a household')}
  description={invite.own ? t('This invite is for your own household.') : invite.joined ? t('You already belong to this household.') : `${t('{name} invited you to their household.', { name: owner })} ${t(invite.role === 'viewer' ? 'You will be able to view their records.' : 'You will be able to view and edit their records.')}`}
  cancelLabel={t('Not now')} confirmLabel={t(usable ? 'Join household' : 'Done')}
  onConfirm={async () => { if (!usable) { onClose(); return; } setBusy(true); try { await household.accept(token); onClose(); } catch (reason) { showError((reason as Error).message); setBusy(false); } }}/>;
}
