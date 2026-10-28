import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(new URL("../supabase/migrations/0015_security_hardening.sql", import.meta.url), "utf8");
const moderationSql = readFileSync(new URL("../supabase/migrations/0016_super_admin_moderation.sql", import.meta.url), "utf8");
const inviteHardeningSql = readFileSync(new URL("../supabase/migrations/0017_invite_hardening.sql", import.meta.url), "utf8");
const engagementSql = readFileSync(new URL("../supabase/migrations/0018_engagement_and_catalogue.sql", import.meta.url), "utf8");
const aggregate = readFileSync(new URL("../presspaper_all_migrations.sql", import.meta.url), "utf8");

describe("security migration", () => {
  it("protects authority columns and organization writes", () => {
    expect(sql).toContain("revoke insert, update, delete on table public.profiles");
    expect(sql).not.toMatch(/grant update \([\s\S]*?institution_name[\s\S]*?\) on table public\.profiles/);
    expect(sql).toContain('create policy "releases_insert_org"');
    expect(sql).toMatch(/create policy "releases_select_published"[\s\S]*?org_is_verified\(institution_slug\)/);
    expect(sql).toContain("revoke insert, update, delete on table public.org_members");
    expect(sql).toContain("revoke all on table public.org_invites");
    expect(sql).toContain("Duplicate active organization owners exist");
  });

  it("uses hashed, expiring, one-use invitations", () => {
    expect(sql).toContain("token_hash");
    expect(sql).toContain("expires_at");
    expect(sql).toContain("consumed_at");
    expect(sql).toContain("digest(invite_token, 'sha256')");
  });

  it("contains persistent abuse controls", () => {
    expect(sql).toContain("consume_ai_quota");
    expect(sql).toContain("enforce_comment_rate_limit");
    expect(sql).toContain("release_view_dedup");
    expect(sql).toContain("public.public_institutions");
    expect(sql).toContain("to anon, authenticated");
  });

  it("keeps the all-in-one migration synchronized", () => {
    expect(aggregate).toContain(sql);
    expect(aggregate).toContain(moderationSql);
    expect(aggregate).toContain(inviteHardeningSql);
    expect(aggregate.endsWith(engagementSql)).toBe(true);
  });
});

describe("engagement and catalogue migration", () => {
  it("keeps rollback, history, reactions and moderation database-enforced", () => {
    expect(engagementSql).toContain("'Archived'");
    expect(engagementSql).toContain("release_revisions");
    expect(engagementSql).toContain("snapshot_release_revision");
    expect(engagementSql).toContain("block_self_follow");
    expect(engagementSql).toContain("comments_delete_org");
    expect(engagementSql).toContain("release_reactions");
    expect(engagementSql).toContain("is_platform_admin");
  });
});

describe("invite hardening migration", () => {
  it("issues short-lived, single-use, email-locked platform invites", () => {
    expect(inviteHardeningSql).toContain("interval '30 minutes'");
    expect(inviteHardeningSql).toContain("digest(plain, 'sha256')");
    expect(inviteHardeningSql).toContain("consumed_at is null");
    expect(inviteHardeningSql).not.toMatch(/interval '7 days'/);
  });

  it("resolves pgcrypto in both public and extensions schemas", () => {
    expect(inviteHardeningSql).toContain("set search_path = public, extensions");
    expect(inviteHardeningSql).toContain("alter function public.accept_platform_invite(text) set search_path = public, extensions");
    expect(inviteHardeningSql).toContain("alter function public.get_platform_invite(text) set search_path = public, extensions");
  });
});

describe("super-admin moderation migration", () => {
  it("enforces account and release moderation in database policies", () => {
    expect(moderationSql).toContain("profiles_account_status_check");
    expect(moderationSql).toContain("releases_moderation_status_check");
    expect(moderationSql).toContain("public.is_account_active(auth.uid())");
    expect(moderationSql).toMatch(/create policy "releases_select_published"[\s\S]*?moderation_status = 'active'/);
    expect(moderationSql).toContain("create or replace function public.require_platform_admin()");
  });

  it("keeps privileged reads and mutations behind checked RPCs and audit logs", () => {
    expect(moderationSql).toContain("create or replace function public.admin_list_users");
    expect(moderationSql).toContain("create or replace function public.admin_list_institutions");
    expect(moderationSql).toContain("create or replace function public.admin_set_account_status");
    expect(moderationSql).toContain("create or replace function public.admin_set_release_moderation");
    expect(moderationSql).toContain("public.admin_audit_events");
    expect(moderationSql).toContain("protected_admin");
    expect(moderationSql).toContain("cannot_self");
  });

  it("records bounded user activity and exposes moderation-safe release details", () => {
    expect(moderationSql).toContain("create or replace function public.record_user_activity");
    expect(moderationSql).toContain("create or replace function public.record_core_mutation_activity");
    expect(moderationSql).toContain("activity_metadata_is_safe");
    expect(moderationSql).toContain("create view public.release_details");
    expect(moderationSql).toContain("r.moderation_status");
    expect(moderationSql).toContain("alter publication supabase_realtime add table public.releases");
  });

  it("retires legacy embedded catalogue data and verification secrets", () => {
    expect(moderationSql).toContain("drop column if exists verification_token");
    expect(moderationSql).toContain("truncate table public.static_release_ids, public.static_institution_slugs");
    expect(moderationSql).not.toContain("welsh-government");
  });
});
