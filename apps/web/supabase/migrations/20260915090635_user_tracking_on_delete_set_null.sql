/*
 * User tracking columns must not block deleting a user.
 *
 * accounts.created_by/updated_by and accounts_memberships.created_by/updated_by
 * referenced auth.users with the default NO ACTION. Any user who had edited a
 * team or a teammate's role therefore could not be deleted (neither by
 * themselves nor from the admin panel): auth.admin.deleteUser failed on
 * accounts_updated_by_fkey / accounts_memberships_updated_by_fkey. Only the
 * primary owner's deletion worked, because it cascades the rows away first.
 *
 * Three coordinated changes, all non-destructive (no data is modified, the
 * constraints are re-created under the same names, both functions are
 * replaced in place):
 *
 * 1. The four FKs become ON DELETE SET NULL.
 * 2. trigger_set_user_tracking() lets the SET NULL cascade through. The cascade
 *    runs as an UPDATE from inside the referential-integrity trigger, and the
 *    function used to re-assert old.created_by on every UPDATE, which undid the
 *    cascade and failed the delete anyway. Ordinary updates are unchanged:
 *    created_by stays immutable and updated_by is stamped, so tables that rely
 *    on the trigger rather than column grants keep that protection.
 * 3. kit.prevent_memberships_update() now rejects changes to the identity
 *    columns (user_id, account_id) instead of requiring account_role to
 *    change. The old check also rejected the SET NULL cascade.
 */
alter table "public"."accounts" drop constraint "accounts_created_by_fkey";

alter table "public"."accounts" drop constraint "accounts_updated_by_fkey";

alter table "public"."accounts_memberships" drop constraint "accounts_memberships_created_by_fkey";

alter table "public"."accounts_memberships" drop constraint "accounts_memberships_updated_by_fkey";

alter table "public"."accounts" add constraint "accounts_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table "public"."accounts" add constraint "accounts_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table "public"."accounts_memberships" add constraint "accounts_memberships_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

alter table "public"."accounts_memberships" add constraint "accounts_memberships_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION kit.prevent_memberships_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
    if new.user_id is distinct from old.user_id
        or new.account_id is distinct from old.account_id then
        raise exception 'Membership identity columns cannot be updated';
    end if;

    return new;

end; $function$
;

CREATE OR REPLACE FUNCTION public.trigger_set_user_tracking()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
    if TG_OP = 'INSERT' then
        new.created_by = auth.uid();
        new.updated_by = auth.uid();

    elsif pg_trigger_depth() > 1
        and ((new.created_by is null and old.created_by is not null)
            or (new.updated_by is null and old.updated_by is not null)) then
        -- referential-integrity cascade: keep the null it set, nothing else
        if new.created_by is not null then
            new.created_by = old.created_by;
        end if;

    else
        new.updated_by = auth.uid();

        new.created_by = old.created_by;

    end if;

    return NEW;

end
$function$
;
