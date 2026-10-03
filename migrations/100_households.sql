-- Households: an owner shares their finances with up to five other people.
-- * Access lives in the database. household_members says who may read an
--   owner's workspace ('member' and 'viewer') and who may change it ('member').
--   can_read_owner() and can_write_owner() answer that for the signed-in person.
-- * A request names the workspace it works on with the x-workspace-owner header
--   (request.headers). active_owner() returns that owner only when the caller
--   belongs to their household, the caller's own id without the header, and
--   refuses otherwise, so removing a member revokes access on the next request.
-- * Shared tables read and write the active workspace: their policies, column
--   defaults and the functions that act on them use active_owner() instead of
--   auth.uid(). Restrictive policies and a row trigger refuse any write to an
--   owner's rows unless the caller may change that workspace, including writes
--   made inside SECURITY DEFINER functions. Viewers can never write.
-- * Personal tables stay with auth.uid(): preferences, Telegram, backups and
--   restore points, app activity. So do backup export and restore.
-- * Invites are single-use links that expire after seven days; only a SHA-256
--   hash of the token is stored.
-- * finance_records.member_id records who paid; it defaults to the person who
--   created the record and only ever names the owner or a household member.
-- * New shared tables must be added to shared_workspace_tables() and new
--   functions on them must use active_owner(); tests/households-sql.mjs checks.
-- Apply after every earlier migration.
BEGIN;

CREATE TABLE public.household_members (
 owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 member_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 role text NOT NULL CHECK (role IN ('member','viewer')),
 joined_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (owner_id,member_id),
 CHECK (owner_id<>member_id)
);
CREATE INDEX household_members_member ON public.household_members(member_id);
CREATE TABLE public.household_invites (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
 role text NOT NULL CHECK (role IN ('member','viewer')),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 accepted_at timestamptz, accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 revoked_at timestamptz
);
CREATE INDEX household_invites_owner ON public.household_invites(owner_id,created_at);
-- Only the functions below touch these tables.
ALTER TABLE public.household_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.household_members, public.household_invites FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.shared_workspace_tables() RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT ARRAY['account_activity','account_reconciliations','asset_movements','budget_amounts','budget_categories','budget_settings',
  'corporate_events','deleted_items','deleted_tracker_updates','expense_plan_versions','expense_plans','finance_records',
  'forecast_assignments','goal_events','goal_operations','holding_accounts','import_batch_items','import_batches','income_sources',
  'investment_account_links','investment_comparison_baselines','investment_comparison_preferences','investment_history',
  'mortgage_payments','payment_occurrences','portfolio_snapshots','record_attachments','record_edit_history','savings_goals',
  'subscription_decisions','transaction_categories','transaction_rules','transaction_splits','transaction_tag_links',
  'transaction_tags','workspace_preferences']::text[]
$$;

CREATE FUNCTION public.can_read_owner(owner uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT auth.uid() IS NOT NULL AND owner IS NOT NULL AND (owner=auth.uid()
  OR EXISTS(SELECT 1 FROM public.household_members m WHERE m.owner_id=owner AND m.member_id=auth.uid()))
$$;
CREATE FUNCTION public.can_write_owner(owner uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT auth.uid() IS NOT NULL AND owner IS NOT NULL AND (owner=auth.uid()
  OR EXISTS(SELECT 1 FROM public.household_members m WHERE m.owner_id=owner AND m.member_id=auth.uid() AND m.role='member'))
$$;
-- The workspace a request asks for, from its x-workspace-owner header.
CREATE FUNCTION public.requested_workspace() RETURNS uuid
LANGUAGE plpgsql STABLE SET search_path=public AS $$
DECLARE headers text:=nullif(current_setting('request.headers',true),''); wanted text;
BEGIN
 IF headers IS NULL THEN RETURN NULL; END IF;
 wanted:=nullif(btrim(headers::jsonb->>'x-workspace-owner'),'');
 IF wanted IS NULL THEN RETURN NULL; END IF;
 IF wanted !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
  RAISE EXCEPTION 'You no longer have access to this shared workspace.' USING ERRCODE='42501';
 END IF;
 RETURN wanted::uuid;
END $$;
CREATE FUNCTION public.active_owner() RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE me uuid:=auth.uid(); wanted uuid;
BEGIN
 IF me IS NULL THEN RETURN NULL; END IF;
 wanted:=public.requested_workspace();
 IF wanted IS NULL OR wanted=me THEN RETURN me; END IF;
 IF EXISTS(SELECT 1 FROM public.household_members WHERE owner_id=wanted AND member_id=me) THEN RETURN wanted; END IF;
 RAISE EXCEPTION 'You no longer have access to this shared workspace.' USING ERRCODE='42501';
END $$;
-- Restrictive write policies: a row the caller may change, a refusal that says so
-- for a row of the workspace they are viewing, and simply not a match otherwise.
CREATE FUNCTION public.shared_row_writable(owner uuid) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF public.can_write_owner(owner) THEN RETURN true; END IF;
 IF owner=public.active_owner() THEN RAISE EXCEPTION 'This shared workspace is view-only.' USING ERRCODE='42501'; END IF;
 RETURN false;
END $$;
-- Owners whose attachment folders the caller may open or change (storage requests carry no workspace header).
CREATE FUNCTION public.attachment_folder_readable(folder text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT auth.uid() IS NOT NULL AND (folder=auth.uid()::text
  OR EXISTS(SELECT 1 FROM public.household_members m WHERE m.owner_id::text=folder AND m.member_id=auth.uid()))
$$;
CREATE FUNCTION public.attachment_record_writable(folder text,record text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.finance_records r WHERE r.id::text=record AND r.user_id::text=folder AND public.can_write_owner(r.user_id))
$$;
REVOKE ALL ON FUNCTION public.can_read_owner(uuid),public.can_write_owner(uuid),public.requested_workspace(),public.active_owner(),public.shared_row_writable(uuid),
 public.attachment_folder_readable(text),public.attachment_record_writable(text,text),public.shared_workspace_tables() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_read_owner(uuid),public.can_write_owner(uuid),public.requested_workspace(),public.active_owner(),public.shared_row_writable(uuid),
 public.attachment_folder_readable(text),public.attachment_record_writable(text,text),public.shared_workspace_tables() TO authenticated;

-- Every write to a shared row needs the right to change its owner's workspace,
-- whichever function or policy let the statement through. The request's role
-- setting stays 'authenticated' inside SECURITY DEFINER functions; service-role
-- jobs and database administrators keep working as before.
CREATE FUNCTION public.guard_shared_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE me uuid:=auth.uid(); owner uuid;
BEGIN
 -- A verified restore writes only the restoring owner's own rows.
 IF me IS NULL OR coalesce(current_setting('role',true),'none') NOT IN ('authenticated','anon') OR public.finance_restore_active() THEN RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END; END IF;
 FOREACH owner IN ARRAY ARRAY[CASE WHEN TG_OP<>'INSERT' THEN (to_jsonb(OLD)->>'user_id')::uuid END,CASE WHEN TG_OP<>'DELETE' THEN (to_jsonb(NEW)->>'user_id')::uuid END] LOOP
  CONTINUE WHEN owner IS NULL OR owner=me OR public.can_write_owner(owner);
  -- Rows removed with their owner's account go with it.
  CONTINUE WHEN TG_OP='DELETE' AND NOT EXISTS(SELECT 1 FROM auth.users WHERE id=owner);
  IF public.can_read_owner(owner) THEN RAISE EXCEPTION 'This shared workspace is view-only.' USING ERRCODE='42501'; END IF;
  RAISE EXCEPTION 'new row violates row-level security policy for table "%"',TG_TABLE_NAME USING ERRCODE='42501';
 END LOOP;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_shared_write() FROM PUBLIC,anon,authenticated;

-- Shared tables: the active workspace in every policy and default, owner-only writes for viewers refused.
DO $$ DECLARE tbl text; policy record; roles text; BEGIN
 FOREACH tbl IN ARRAY public.shared_workspace_tables() LOOP
  FOR policy IN SELECT * FROM pg_policies WHERE schemaname='public' AND tablename=tbl LOOP
   SELECT string_agg(CASE WHEN role='public' THEN 'PUBLIC' ELSE quote_ident(role) END,',') INTO roles FROM unnest(policy.roles) role;
   EXECUTE format('DROP POLICY %I ON public.%I',policy.policyname,tbl);
   EXECUTE format('CREATE POLICY %I ON public.%I AS %s FOR %s TO %s%s%s',policy.policyname,tbl,policy.permissive,policy.cmd,roles,
    CASE WHEN policy.qual IS NULL THEN '' ELSE ' USING ('||replace(policy.qual,'auth.uid()','(SELECT public.active_owner())')||')' END,
    CASE WHEN policy.with_check IS NULL THEN '' ELSE ' WITH CHECK ('||replace(policy.with_check,'auth.uid()','(SELECT public.active_owner())')||')' END);
  END LOOP;
  EXECUTE format('CREATE POLICY shared_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.shared_row_writable(user_id))',tbl);
  EXECUTE format('CREATE POLICY shared_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.shared_row_writable(user_id)) WITH CHECK (public.shared_row_writable(user_id))',tbl);
  EXECUTE format('CREATE POLICY shared_delete ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (public.shared_row_writable(user_id))',tbl);
  IF (SELECT pg_get_expr(d.adbin,d.adrelid) FROM pg_attrdef d JOIN pg_attribute a ON a.attrelid=d.adrelid AND a.attnum=d.adnum
      WHERE d.adrelid=('public.'||tbl)::regclass AND a.attname='user_id')='auth.uid()' THEN
   EXECUTE format('ALTER TABLE public.%I ALTER COLUMN user_id SET DEFAULT public.active_owner()',tbl);
  END IF;
  EXECUTE format('CREATE TRIGGER guard_shared_write BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_shared_write()',tbl);
 END LOOP;
END $$;

-- Functions that act on shared tables work on the active workspace. Personal
-- ones (backups, restore, app activity) and this migration's own keep auth.uid().
DO $$ DECLARE fn oid; BEGIN
 FOR fn IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.prosrc LIKE '%auth.uid()%' AND NOT p.proname=ANY(ARRAY['export_finance_backup','export_finance_backup_before_movements',
   'export_finance_backup_before_transaction_tools','finance_backup_state','preview_finance_restore','restore_finance_backup',
   'get_backup_recovery','finance_restore_active','mark_app_started','can_read_owner','can_write_owner','active_owner',
   'attachment_folder_readable','guard_shared_write'])
 LOOP
  EXECUTE replace(pg_get_functiondef(fn),'auth.uid()','public.active_owner()');
 END LOOP;
END $$;

-- Attachments: files sit in the owner's folder; household members open them, members add and remove them.
DO $storage$
BEGIN
 IF to_regclass('storage.objects') IS NULL THEN RETURN; END IF;
 DROP POLICY IF EXISTS "Owners read their attachments" ON storage.objects;
 DROP POLICY IF EXISTS "Owners upload attachments to their records" ON storage.objects;
 DROP POLICY IF EXISTS "Owners remove their attachments" ON storage.objects;
 CREATE POLICY "Owners read their attachments" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id='attachments' AND public.attachment_folder_readable((storage.foldername(name))[1]));
 CREATE POLICY "Owners upload attachments to their records" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id='attachments' AND public.attachment_record_writable((storage.foldername(name))[1],(storage.foldername(name))[2]));
 CREATE POLICY "Owners remove their attachments" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id='attachments' AND public.can_write_owner(CASE WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN ((storage.foldername(name))[1])::uuid END));
END $storage$;

-- Who paid: the creator unless someone else in the household is chosen.
ALTER TABLE public.finance_records ADD COLUMN member_id uuid;
CREATE FUNCTION public.attribute_finance_record() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 -- A verified restore brings records back exactly as they were saved.
 IF public.finance_restore_active() THEN RETURN NEW; END IF;
 IF TG_OP='INSERT' AND NEW.member_id IS NULL THEN NEW.member_id:=auth.uid(); END IF;
 IF NEW.member_id IS NOT NULL AND NEW.member_id<>NEW.user_id AND (TG_OP='INSERT' OR NEW.member_id IS DISTINCT FROM OLD.member_id)
  AND NOT EXISTS(SELECT 1 FROM public.household_members WHERE owner_id=NEW.user_id AND member_id=NEW.member_id) THEN
  -- Someone outside the household (a former member, a restored copy) is not named.
  NEW.member_id:=NULL;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.attribute_finance_record() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER attribute_finance_record BEFORE INSERT OR UPDATE OF member_id,user_id ON public.finance_records FOR EACH ROW EXECUTE FUNCTION public.attribute_finance_record();
DO $$ DECLARE definition text:=pg_get_functiondef('public.save_finance_record(jsonb,bigint)'::regprocedure); BEGIN
 IF position($q$'business_logo']$q$ in definition)=0 THEN RAISE EXCEPTION 'Unexpected save_finance_record definition'; END IF;
 EXECUTE replace(definition,$q$'business_logo']$q$,$q$'business_logo','member_id']$q$);
END $$;

-- The people of a household, by the name each chose in Settings (or their email).
CREATE FUNCTION public.household_person(person uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce((SELECT nullif(btrim(display_name),'') FROM public.user_preferences WHERE user_id=person),
  (SELECT to_jsonb(u)->>'email' FROM auth.users u WHERE u.id=person))
$$;
REVOKE ALL ON FUNCTION public.household_person(uuid) FROM PUBLIC,anon,authenticated;

-- Everything Settings shows: your household (members, open invites) and the households you belong to.
CREATE FUNCTION public.household_state() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE me uuid:=auth.uid();
BEGIN
 IF me IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 RETURN jsonb_build_object('me',me,'name',public.household_person(me),
  'members',coalesce((SELECT jsonb_agg(jsonb_build_object('id',m.member_id,'name',public.household_person(m.member_id),'role',m.role,'joined_at',m.joined_at) ORDER BY m.joined_at,m.member_id)
   FROM public.household_members m WHERE m.owner_id=me),'[]'),
  'invites',coalesce((SELECT jsonb_agg(jsonb_build_object('id',i.id,'role',i.role,'created_at',i.created_at,'expires_at',i.expires_at) ORDER BY i.created_at,i.id)
   FROM public.household_invites i WHERE i.owner_id=me AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at>now()),'[]'),
  'memberships',coalesce((SELECT jsonb_agg(jsonb_build_object('owner_id',m.owner_id,'name',public.household_person(m.owner_id),'role',m.role) ORDER BY m.joined_at,m.owner_id)
   FROM public.household_members m WHERE m.member_id=me),'[]'));
END $$;
-- The people of the active workspace: its owner first, then members.
CREATE FUNCTION public.household_people() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE owner uuid:=public.active_owner();
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 RETURN jsonb_build_array(jsonb_build_object('id',owner,'name',public.household_person(owner),'role','owner'))
  || coalesce((SELECT jsonb_agg(jsonb_build_object('id',m.member_id,'name',public.household_person(m.member_id),'role',m.role) ORDER BY m.joined_at,m.member_id)
   FROM public.household_members m WHERE m.owner_id=owner),'[]');
END $$;
-- Up to six people: the owner, members and invites still open.
CREATE FUNCTION public.create_household_invite(p_role text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE me uuid:=auth.uid(); token text; invite public.household_invites;
BEGIN
 IF me IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 IF p_role IS NULL OR p_role NOT IN ('member','viewer') THEN RAISE EXCEPTION 'Choose what they can do.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(me::text,100));
 IF (SELECT count(*) FROM public.household_members WHERE owner_id=me)
  +(SELECT count(*) FROM public.household_invites WHERE owner_id=me AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now())>=5 THEN
  RAISE EXCEPTION 'A household has up to six people.';
 END IF;
 token:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
 INSERT INTO public.household_invites(owner_id,token_hash,role,expires_at)
 VALUES(me,encode(sha256(convert_to(token,'UTF8')),'hex'),p_role,now()+interval '7 days') RETURNING * INTO invite;
 RETURN jsonb_build_object('id',invite.id,'token',token,'role',invite.role,'expires_at',invite.expires_at);
END $$;
CREATE FUNCTION public.revoke_household_invite(p_id uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 UPDATE public.household_invites SET revoked_at=now() WHERE id=p_id AND owner_id=auth.uid() AND accepted_at IS NULL AND revoked_at IS NULL
$$;
-- An invite that can still be accepted, found by its token.
CREATE FUNCTION public.open_household_invite(p_token text) RETURNS public.household_invites
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE invite public.household_invites;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 SELECT * INTO invite FROM public.household_invites WHERE p_token ~ '^[0-9a-f]{64}$' AND token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
 IF invite.id IS NULL OR invite.accepted_at IS NOT NULL OR invite.revoked_at IS NOT NULL OR invite.expires_at<=now() THEN
  RAISE EXCEPTION 'This invite link is no longer valid. Ask for a new one.';
 END IF;
 RETURN invite;
END $$;
REVOKE ALL ON FUNCTION public.open_household_invite(text) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.preview_household_invite(p_token text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE invite public.household_invites:=public.open_household_invite(p_token);
BEGIN
 RETURN jsonb_build_object('owner_id',invite.owner_id,'name',public.household_person(invite.owner_id),'role',invite.role,'expires_at',invite.expires_at,
  'own',invite.owner_id=auth.uid(),'joined',EXISTS(SELECT 1 FROM public.household_members WHERE owner_id=invite.owner_id AND member_id=auth.uid()));
END $$;
CREATE FUNCTION public.accept_household_invite(p_token text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE me uuid:=auth.uid(); invite public.household_invites:=public.open_household_invite(p_token);
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(invite.owner_id::text,100));
 -- Re-read under the lock, so two people cannot use one link.
 SELECT * INTO invite FROM public.household_invites WHERE id=invite.id AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now() FOR UPDATE;
 IF invite.id IS NULL THEN RAISE EXCEPTION 'This invite link is no longer valid. Ask for a new one.'; END IF;
 IF invite.owner_id=me THEN RAISE EXCEPTION 'This invite is for your own household.'; END IF;
 IF EXISTS(SELECT 1 FROM public.household_members WHERE owner_id=invite.owner_id AND member_id=me) THEN RAISE EXCEPTION 'You already belong to this household.'; END IF;
 IF (SELECT count(*) FROM public.household_members WHERE owner_id=invite.owner_id)>=5 THEN RAISE EXCEPTION 'A household has up to six people.'; END IF;
 INSERT INTO public.household_members(owner_id,member_id,role) VALUES(invite.owner_id,me,invite.role);
 UPDATE public.household_invites SET accepted_at=now(),accepted_by=me WHERE id=invite.id;
 RETURN jsonb_build_object('owner_id',invite.owner_id,'role',invite.role);
END $$;
CREATE FUNCTION public.set_household_role(p_member uuid,p_role text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF p_role IS NULL OR p_role NOT IN ('member','viewer') THEN RAISE EXCEPTION 'Choose what they can do.'; END IF;
 UPDATE public.household_members SET role=p_role WHERE owner_id=auth.uid() AND member_id=p_member;
 IF NOT FOUND THEN RAISE EXCEPTION 'This person is no longer in your household.'; END IF;
END $$;
-- The owner removes someone, or a member leaves; access ends with the row.
CREATE FUNCTION public.remove_household_member(p_owner uuid,p_member uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NULL OR auth.uid() NOT IN (p_owner,p_member) THEN RAISE EXCEPTION 'Only the owner can remove someone else.'; END IF;
 DELETE FROM public.household_members WHERE owner_id=p_owner AND member_id=p_member;
END $$;
REVOKE ALL ON FUNCTION public.household_state(),public.household_people(),public.create_household_invite(text),public.revoke_household_invite(uuid),
 public.preview_household_invite(text),public.accept_household_invite(text),public.set_household_role(uuid,text),public.remove_household_member(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.household_state(),public.household_people(),public.create_household_invite(text),public.revoke_household_invite(uuid),
 public.preview_household_invite(text),public.accept_household_invite(text),public.set_household_role(uuid,text),public.remove_household_member(uuid,uuid) TO authenticated;

-- Who paid for transactions, set from the Transactions list; only someone in the household.
CREATE FUNCTION public.set_transaction_member(p_ids uuid[],p_member uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner uuid:=public.active_owner(); changed integer;
BEGIN
 IF owner IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
 IF coalesce(array_length(p_ids,1),0)>500 THEN RAISE EXCEPTION 'Check the record fields.'; END IF;
 IF p_member IS NULL OR (p_member<>owner AND NOT EXISTS(SELECT 1 FROM public.household_members WHERE owner_id=owner AND member_id=p_member)) THEN
  RAISE EXCEPTION 'This person is no longer in your household.';
 END IF;
 UPDATE public.finance_records SET member_id=p_member WHERE id=ANY(p_ids) AND user_id=owner AND member_id IS DISTINCT FROM p_member;
 GET DIAGNOSTICS changed=ROW_COUNT;
 RETURN changed;
END $$;
REVOKE ALL ON FUNCTION public.set_transaction_member(uuid[],uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_transaction_member(uuid[],uuid) TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
