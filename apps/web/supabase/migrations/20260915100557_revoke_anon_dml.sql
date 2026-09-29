/*
 * Reconcile anon's table privileges with the declarative schema.
 *
 * The base migration revokes anon's privileges on schema public and on "all
 * tables in schema public", but that second statement ran before any kit table
 * existed, so every table created afterwards kept Supabase's default grant of
 * select/insert/update/delete to anon. The schema files in schemas/ revoke it
 * per table, so `supabase db diff` re-emitted these 48 statements on every run.
 *
 * Nothing observable changes: anon holds no usage on schema public, so it could
 * not reach these tables anyway. This removes the single-layer dependency on
 * that schema revoke and makes a clean `db diff` mean what it says.
 *
 * Non-destructive: privileges only, no data or object changes.
 */
revoke delete on table "public"."accounts" from "anon";

revoke insert on table "public"."accounts" from "anon";

revoke select on table "public"."accounts" from "anon";

revoke update on table "public"."accounts" from "anon";

revoke delete on table "public"."accounts_memberships" from "anon";

revoke insert on table "public"."accounts_memberships" from "anon";

revoke select on table "public"."accounts_memberships" from "anon";

revoke update on table "public"."accounts_memberships" from "anon";

revoke delete on table "public"."billing_customers" from "anon";

revoke insert on table "public"."billing_customers" from "anon";

revoke select on table "public"."billing_customers" from "anon";

revoke update on table "public"."billing_customers" from "anon";

revoke delete on table "public"."config" from "anon";

revoke insert on table "public"."config" from "anon";

revoke select on table "public"."config" from "anon";

revoke update on table "public"."config" from "anon";

revoke delete on table "public"."invitations" from "anon";

revoke insert on table "public"."invitations" from "anon";

revoke select on table "public"."invitations" from "anon";

revoke update on table "public"."invitations" from "anon";

revoke delete on table "public"."notifications" from "anon";

revoke insert on table "public"."notifications" from "anon";

revoke select on table "public"."notifications" from "anon";

revoke update on table "public"."notifications" from "anon";

revoke delete on table "public"."order_items" from "anon";

revoke insert on table "public"."order_items" from "anon";

revoke select on table "public"."order_items" from "anon";

revoke update on table "public"."order_items" from "anon";

revoke delete on table "public"."orders" from "anon";

revoke insert on table "public"."orders" from "anon";

revoke select on table "public"."orders" from "anon";

revoke update on table "public"."orders" from "anon";

revoke delete on table "public"."role_permissions" from "anon";

revoke insert on table "public"."role_permissions" from "anon";

revoke select on table "public"."role_permissions" from "anon";

revoke update on table "public"."role_permissions" from "anon";

revoke delete on table "public"."roles" from "anon";

revoke insert on table "public"."roles" from "anon";

revoke select on table "public"."roles" from "anon";

revoke update on table "public"."roles" from "anon";

revoke delete on table "public"."subscription_items" from "anon";

revoke insert on table "public"."subscription_items" from "anon";

revoke select on table "public"."subscription_items" from "anon";

revoke update on table "public"."subscription_items" from "anon";

revoke delete on table "public"."subscriptions" from "anon";

revoke insert on table "public"."subscriptions" from "anon";

revoke select on table "public"."subscriptions" from "anon";

revoke update on table "public"."subscriptions" from "anon";

revoke delete on table "public"."user_active_account" from "anon";

revoke insert on table "public"."user_active_account" from "anon";

revoke select on table "public"."user_active_account" from "anon";

revoke update on table "public"."user_active_account" from "anon";


