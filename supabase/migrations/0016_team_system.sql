-- team_members
CREATE TABLE IF NOT EXISTS public.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email text NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'disabled')),
  role_template text NOT NULL DEFAULT 'agent' CHECK (role_template IN ('admin', 'agent', 'viewer', 'custom')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  max_conversations int,
  UNIQUE (org_id, email)
);

-- team_member_permissions (boolean columns por permissão)
CREATE TABLE IF NOT EXISTS public.team_member_permissions (
  team_member_id uuid PRIMARY KEY REFERENCES public.team_members(id) ON DELETE CASCADE,
  can_view_inbox boolean NOT NULL DEFAULT true,
  can_view_contacts boolean NOT NULL DEFAULT true,
  can_view_campaigns boolean NOT NULL DEFAULT false,
  can_view_agent_ai boolean NOT NULL DEFAULT false,
  can_view_flows boolean NOT NULL DEFAULT false,
  can_view_automations boolean NOT NULL DEFAULT false,
  can_view_connections boolean NOT NULL DEFAULT false,
  can_view_integrations boolean NOT NULL DEFAULT false,
  can_view_reports boolean NOT NULL DEFAULT false,
  can_view_settings boolean NOT NULL DEFAULT false,
  can_view_billing boolean NOT NULL DEFAULT false,
  can_reply_messages boolean NOT NULL DEFAULT true,
  can_pause_bot boolean NOT NULL DEFAULT true,
  can_assign_conversation boolean NOT NULL DEFAULT true,
  can_resolve_conversation boolean NOT NULL DEFAULT true,
  can_archive_conversation boolean NOT NULL DEFAULT true,
  can_add_remove_labels boolean NOT NULL DEFAULT true,
  can_add_internal_notes boolean NOT NULL DEFAULT true,
  can_view_others_notes boolean NOT NULL DEFAULT true,
  can_export_conversation boolean NOT NULL DEFAULT false,
  can_block_contact boolean NOT NULL DEFAULT false,
  inbox_scope text NOT NULL DEFAULT 'all' CHECK (inbox_scope IN ('all', 'assigned_only')),
  can_edit_contacts boolean NOT NULL DEFAULT true,
  can_delete_contacts boolean NOT NULL DEFAULT false,
  can_import_contacts boolean NOT NULL DEFAULT false,
  can_export_contacts boolean NOT NULL DEFAULT false
);

-- team_invites (tokens CSPRNG, expiram em 48h)
CREATE TABLE IF NOT EXISTS public.team_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id uuid NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- profile_photo_status para contacts
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS profile_photo_status text
    CHECK (profile_photo_status IN ('available', 'private', 'unknown')) DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_team_members_org ON public.team_members (org_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user ON public.team_members (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_team_invites_token ON public.team_invites (token);
