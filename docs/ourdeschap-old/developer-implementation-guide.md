# Ouderschap & Co — Developer Implementation Guide

> **For**: Kretoss Technology development team  
> **Backend**: Supabase (PostgreSQL + Auth + Storage Buckets + Realtime + **Edge Functions**)  
> **Frontend**: React 19 + TanStack Router + TanStack Start + Vite  
> **Env**: `.env` already contains `SUPABASE_URL` and `SUPABASE_ANON_KEY`

> [!IMPORTANT]
> - **All server-side logic uses Supabase Edge Functions** — no database functions, no triggers, no PL/pgSQL.
> - **All image/file uploads use Supabase Storage Buckets** — avatars, receipts, documents, moment photos.
> - **All database table names are in English** — column names also in English for consistency.

---

## Table of Contents

1. [Current State Assessment](#1-current-state-assessment)
2. [Tech Stack & Setup](#2-tech-stack--setup)
3. [Milestone 1 — Backend, Auth, Parent Linking](#3-milestone-1--backend-auth-parent-linking)
4. [Milestone 2 — Core Features Backend Connection](#4-milestone-2--core-features-backend-connection)
5. [Milestone 3 — Professional Environment](#5-milestone-3--professional-environment)
6. [Milestone 4 — Payments, i18n, Apps](#6-milestone-4--payments-i18n-apps)
7. [Edge Functions Reference](#7-edge-functions-reference)
8. [Storage Buckets & Image Uploads](#8-storage-buckets--image-uploads)
9. [Store Migration Pattern](#9-store-migration-pattern)
10. [File Structure for New Code](#10-file-structure-for-new-code)

---

## 1. Current State Assessment

### What Already Exists ✅

| Layer | Status | Details |
|-------|--------|---------|
| **46 route files** | ✅ Built | Full UI for all parent features, professional portal, settings |
| **55 store/lib files** | ✅ Built | In-memory state with `useSyncExternalStore` pattern |
| **31 components** | ✅ Built | Reusable UI components, assistant, import, scanner |
| **UI kit** | ✅ Built | Radix UI + Tailwind CSS v4 + shadcn/ui pattern |
| **AI server functions** | ✅ Stubs | 5 `createServerFn` files (coach, assistant, summary, school, plan) |
| **Demo data** | ✅ Built | Fictitious family (Sanne + Joris, kids Emma + Noah) |
| **Audit system** | ✅ Built | Append-only event logging (in-memory) |
| **Design/branding** | ✅ Built | Warm, premium Dutch design — preserve as-is |

### What Does NOT Exist Yet 🔴

| Layer | Status | What's Needed |
|-------|--------|---------------|
| **Supabase JS client** | ❌ Not installed | `npm install @supabase/supabase-js` |
| **Supabase client init** | ❌ Not created | Need `src/lib/supabase.ts` |
| **Database tables** | ❌ None | Full schema needed in Supabase |
| **RLS policies** | ❌ None | Every table needs policies |
| **Edge Functions** | ❌ None | All server logic via `supabase/functions/` |
| **Auth flow** | ❌ None | Login, register, reset, session |
| **Auth pages** | ❌ None | `/login`, `/register`, `/wachtwoord-vergeten` |
| **Auth guard** | ❌ None | Protected routes, redirect to login |
| **Real data persistence** | ❌ Demo only | All stores use in-memory arrays |
| **Storage Buckets** | ❌ None | Avatars, documents, receipts, moment photos |
| **Realtime** | ❌ None | Live updates for messages, proposals |
| **OpenAI connection** | ❌ Stubs only | Edge Function for AI calls |

### Data Flow Pattern (Current → Target)

```
CURRENT (demo):
  demo-data.ts → in-memory array → useSyncExternalStore → component

TARGET (production):
  Supabase DB → @tanstack/react-query → component
  Mutations → Edge Function → RLS check → DB → realtime → other users
  Image uploads → Supabase Storage Bucket → public/signed URL → component
```

---

## 2. Tech Stack & Setup

### Step 1: Install Supabase Client

```bash
npm install @supabase/supabase-js
```

### Step 2: Create Supabase Client (`src/lib/supabase.ts`)

```typescript
import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)
```

> **⚠️ IMPORTANT**: The current `.env` uses `SUPABASE_URL` but Vite only exposes
> variables prefixed with `VITE_`. Either:
> - Rename to `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` in `.env`, OR
> - Access via server-side only through `createServerFn` (TanStack Start can read all env vars server-side)
>
> For the **anon key** (used in browser), use `VITE_` prefix.
> For the **service role key** (admin operations), keep WITHOUT `VITE_` prefix (server-only, used in Edge Functions).

### Step 3: Update `.env`

```env
# Client-side (exposed to browser)
VITE_SUPABASE_URL=https://hbimbzwcdmhnxxdbbugw.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...

# Server-only (NEVER exposed to browser — used by Edge Functions)
SUPABASE_SERVICE_ROLE_KEY=<get from Supabase dashboard>
OPENAI_API_KEY=<client's OpenAI key>
```

### Step 4: Install Supabase CLI (for Edge Functions)

```bash
npm install -g supabase
supabase init
supabase login
supabase link --project-ref hbimbzwcdmhnxxdbbugw
```

### Step 5: Generate TypeScript Types

```bash
npx supabase gen types typescript --project-id hbimbzwcdmhnxxdbbugw > src/lib/database.types.ts
```

---

## 3. Milestone 1 — Backend, Auth, Parent Linking

### 3.1 Database Tables (Create in Supabase SQL Editor)

> **All table and column names are in English.**
> No database functions or triggers — all logic lives in Edge Functions.

Run in this order (foreign keys depend on sequence):

#### a) Users & Profiles

```sql
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  usage_mode TEXT NOT NULL DEFAULT 'together' CHECK (usage_mode IN ('together', 'solo')),
  onboarding_completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

> **No trigger here** — profile creation on signup is handled by the `create-profile` Edge Function (see Section 7).

#### b) Children

```sql
CREATE TABLE public.children (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  last_name TEXT,
  date_of_birth DATE,
  avatar_url TEXT,
  school TEXT,
  daycare TEXT,
  doctor TEXT,
  medical_notes TEXT,
  practical_notes TEXT,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Which parent has access to which child
CREATE TABLE public.child_parents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  parent_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'parent',
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(child_id, parent_id)
);
```

#### c) Parent Invitations & Linking

```sql
CREATE TABLE public.invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_parent_id UUID NOT NULL REFERENCES public.profiles(id),
  to_email TEXT NOT NULL,
  child_ids UUID[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'sent'
    CHECK (status IN ('sent', 'viewed', 'accepted', 'rejected', 'expired')),
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '30 days',
  accepted_at TIMESTAMPTZ,
  to_parent_id UUID REFERENCES public.profiles(id)
);

-- Connection between two parents (after accepted invitation)
CREATE TABLE public.parent_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_1_id UUID NOT NULL REFERENCES public.profiles(id),
  parent_2_id UUID NOT NULL REFERENCES public.profiles(id),
  invitation_id UUID REFERENCES public.invitations(id),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'ended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(parent_1_id, parent_2_id)
);
```

#### d) Child Contacts

```sql
CREATE TABLE public.child_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT,
  phone TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### e) Private Notes (NEVER shared automatically)

```sql
CREATE TABLE public.private_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  child_id UUID REFERENCES public.children(id) ON DELETE CASCADE,
  title TEXT,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 3.2 RLS Policies (Milestone 1)

```sql
-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.children ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.child_parents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parent_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.child_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.private_notes ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read/update their own profile
CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Users can see profiles of connected parents
CREATE POLICY "Users can see connected parent profiles"
  ON public.profiles FOR SELECT
  USING (
    id IN (
      SELECT parent_2_id FROM public.parent_connections WHERE parent_1_id = auth.uid() AND status = 'active'
      UNION
      SELECT parent_1_id FROM public.parent_connections WHERE parent_2_id = auth.uid() AND status = 'active'
    )
  );

-- Children: only parents linked to the child can see/edit
CREATE POLICY "Parents can see own children"
  ON public.children FOR SELECT
  USING (
    id IN (SELECT child_id FROM public.child_parents WHERE parent_id = auth.uid())
  );

CREATE POLICY "Parents can create children"
  ON public.children FOR INSERT
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Parents can update own children"
  ON public.children FOR UPDATE
  USING (
    id IN (SELECT child_id FROM public.child_parents WHERE parent_id = auth.uid())
  );

-- child_parents: parents can see their own links
CREATE POLICY "Parents can see own child links"
  ON public.child_parents FOR SELECT
  USING (parent_id = auth.uid());

CREATE POLICY "Parents can add themselves to children they created"
  ON public.child_parents FOR INSERT
  WITH CHECK (parent_id = auth.uid());

-- Also allow seeing co-parent's child links (for shared children)
CREATE POLICY "Parents can see co-parent child links"
  ON public.child_parents FOR SELECT
  USING (
    child_id IN (SELECT child_id FROM public.child_parents WHERE parent_id = auth.uid())
  );

-- Child contacts: visible to linked parents
CREATE POLICY "Parents can manage child contacts"
  ON public.child_contacts FOR ALL
  USING (
    child_id IN (SELECT child_id FROM public.child_parents WHERE parent_id = auth.uid())
  );

-- Private notes: only the owner can see
CREATE POLICY "Only owner can manage private notes"
  ON public.private_notes FOR ALL
  USING (parent_id = auth.uid());

-- Invitations: sender can see sent, recipient can see received
CREATE POLICY "Sender can see own invitations"
  ON public.invitations FOR SELECT
  USING (from_parent_id = auth.uid());

CREATE POLICY "Sender can create invitations"
  ON public.invitations FOR INSERT
  WITH CHECK (from_parent_id = auth.uid());

-- Parent connections: visible to both parents
CREATE POLICY "Parents can see own connections"
  ON public.parent_connections FOR SELECT
  USING (parent_1_id = auth.uid() OR parent_2_id = auth.uid());
```

### 3.3 Auth Pages to Create

| Route | File | Purpose |
|-------|------|---------|
| `/login` | `src/routes/login.tsx` | Email + password login |
| `/registreren` | `src/routes/registreren.tsx` | New account registration |
| `/wachtwoord-vergeten` | `src/routes/wachtwoord-vergeten.tsx` | Password reset request |
| `/wachtwoord-reset` | `src/routes/wachtwoord-reset.tsx` | Set new password (from email link) |

### 3.4 Auth Implementation

#### Create Auth Hook (`src/hooks/useAuth.ts`)

```typescript
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { User, Session } from '@supabase/supabase-js'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session)
        setUser(session?.user ?? null)
        setLoading(false)

        // On first sign-up, call Edge Function to create profile
        if (_event === 'SIGNED_IN' && session?.user) {
          await supabase.functions.invoke('create-profile', {
            body: { name: session.user.user_metadata?.naam ?? 'Gebruiker' }
          })
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  return {
    user,
    session,
    loading,
    signUp: (email: string, password: string, naam: string) =>
      supabase.auth.signUp({
        email,
        password,
        options: { data: { naam } }
      }),
    signIn: (email: string, password: string) =>
      supabase.auth.signInWithPassword({ email, password }),
    signOut: () => supabase.auth.signOut(),
    resetPassword: (email: string) =>
      supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/wachtwoord-reset`
      }),
  }
}
```

#### Create Auth Guard (`src/components/AuthGuard.tsx`)

```typescript
import { useAuth } from '@/hooks/useAuth'
import { Navigate } from '@tanstack/react-router'

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) return <LoadingSpinner />
  if (!user) return <Navigate to="/login" />

  return <>{children}</>
}
```

### 3.5 Parent Invitation Flow

```
1. Parent A registers → Edge Function "create-profile" creates profile
2. Parent A adds child → direct Supabase insert (RLS allows)
3. Parent A clicks "Andere ouder uitnodigen"
4. Client calls Edge Function "send-invitation" → creates invitation + sends email
5. Parent B clicks link: /uitnodiging?token=xxx
6. Parent B registers (or logs in)
7. Parent B calls Edge Function "accept-invitation" → creates parent_connection + child_parents records
8. Both parents now see shared children (via RLS)
9. Private notes remain private (separate RLS)
```

### 3.6 Milestone 1 — Testing Checklist

```
□ Register new user → profile created via Edge Function
□ Login → session persisted → refresh works
□ Logout → redirect to login
□ Password reset → email sent → new password works
□ Create child profile → stored in Supabase
□ Create multiple children → no uniqueness errors
□ Add private note → only visible to creator
□ Send invitation → Edge Function creates record + sends email
□ Accept invitation → Edge Function links parent + grants child access
□ Connected parent cannot see private notes
□ Duplicate invitation → handled gracefully
□ Expired invitation → cannot accept
□ Unauthorized access → blocked by RLS
□ Works on mobile, tablet, desktop
```

---

## 4. Milestone 2 — Core Features Backend Connection

### 4.1 Database Tables (Additional)

#### a) Conversations & Messages

```sql
CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES public.parent_connections(id),
  subject TEXT NOT NULL,
  category TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id),
  content TEXT NOT NULL,
  is_draft BOOLEAN NOT NULL DEFAULT false,
  ai_rewritten BOOLEAN NOT NULL DEFAULT false,
  original_text TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### b) Calendar Events

```sql
CREATE TABLE public.calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID REFERENCES public.parent_connections(id),
  parent_id UUID NOT NULL REFERENCES public.profiles(id),
  child_id UUID REFERENCES public.children(id),
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'other',
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ,
  all_day BOOLEAN NOT NULL DEFAULT false,
  responsible_parent UUID REFERENCES public.profiles(id),
  recurrence JSONB,
  is_shared BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('proposal', 'confirmed', 'rejected', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### c) Care Schedules

```sql
CREATE TABLE public.care_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  pattern TEXT NOT NULL,
  days JSONB NOT NULL,
  switch_time TEXT,
  switch_location TEXT,
  start_monday DATE NOT NULL,
  version INT NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One-off exceptions (never alter the base schedule!)
CREATE TABLE public.care_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL REFERENCES public.care_schedules(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  with_parent UUID NOT NULL REFERENCES public.profiles(id),
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'proposal'
    CHECK (status IN ('proposal', 'accepted', 'rejected')),
  proposed_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### d) Expenses

```sql
CREATE TABLE public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID REFERENCES public.parent_connections(id),
  parent_id UUID NOT NULL REFERENCES public.profiles(id),
  child_id UUID REFERENCES public.children(id),
  description TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  split_ratio TEXT NOT NULL DEFAULT '50/50',
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'marked', 'received', 'disputed')),
  receipt_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### e) Tasks

```sql
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID REFERENCES public.parent_connections(id),
  child_id UUID REFERENCES public.children(id),
  title TEXT NOT NULL,
  description TEXT,
  assigned_to UUID REFERENCES public.profiles(id),
  deadline DATE,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'done')),
  recurrence JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### f) Belongings / Items

```sql
CREATE TABLE public.belongings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT,
  with_parent UUID REFERENCES public.profiles(id),
  take_on_switch BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### g) Agreements

```sql
CREATE TABLE public.agreements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES public.parent_connections(id),
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'proposal'
    CHECK (status IN ('proposal', 'accepted', 'rejected', 'revised')),
  proposed_by UUID NOT NULL REFERENCES public.profiles(id),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### h) Documents

```sql
CREATE TABLE public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID REFERENCES public.parent_connections(id),
  parent_id UUID NOT NULL REFERENCES public.profiles(id),
  child_id UUID REFERENCES public.children(id),
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INT,
  is_shared BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### i) Shared Moments

```sql
CREATE TABLE public.moments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID NOT NULL REFERENCES public.profiles(id),
  child_id UUID REFERENCES public.children(id),
  text TEXT NOT NULL,
  photo_url TEXT,
  shared_with TEXT NOT NULL DEFAULT 'parents'
    CHECK (shared_with IN ('parents', 'circle', 'private')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### j) Holidays & Special Days

```sql
CREATE TABLE public.holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID REFERENCES public.parent_connections(id),
  child_id UUID REFERENCES public.children(id),
  title TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'holiday'
    CHECK (type IN ('holiday', 'birthday', 'special_day', 'school_holiday')),
  start_date DATE NOT NULL,
  end_date DATE,
  with_parent UUID REFERENCES public.profiles(id),
  status TEXT NOT NULL DEFAULT 'proposal'
    CHECK (status IN ('proposal', 'accepted', 'rejected', 'confirmed')),
  proposed_by UUID REFERENCES public.profiles(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### k) Audit Trail (History)

```sql
CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  section TEXT NOT NULL,
  item_id TEXT NOT NULL,
  item_label TEXT,
  action TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Prevent updates and deletes via RLS (no trigger needed)
-- The Edge Function for audit logging only does INSERT, never UPDATE/DELETE
-- RLS policy below blocks any UPDATE/DELETE from all roles
```

#### l) Notifications

```sql
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

#### m) Circle / Family Members (Kring)

```sql
CREATE TABLE public.circle_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  practical_role TEXT,
  legal_role TEXT DEFAULT 'none',
  phone TEXT,
  email TEXT,
  invited_user_id UUID REFERENCES public.profiles(id),
  invitation_status TEXT NOT NULL DEFAULT 'contact_only'
    CHECK (invitation_status IN ('contact_only', 'invited', 'confirmed', 'revoked')),
  access_sections JSONB NOT NULL DEFAULT '[]',
  access_start TIMESTAMPTZ,
  access_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 4.2 RLS Policies (Milestone 2)

```sql
-- Enable RLS on all M2 tables
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.care_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.care_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.belongings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.circle_members ENABLE ROW LEVEL SECURITY;

-- Conversations & Messages: both connected parents
CREATE POLICY "Connected parents can access conversations"
  ON public.conversations FOR ALL
  USING (
    connection_id IN (
      SELECT id FROM public.parent_connections
      WHERE (parent_1_id = auth.uid() OR parent_2_id = auth.uid()) AND status = 'active'
    )
  );

CREATE POLICY "Connected parents can access messages"
  ON public.messages FOR ALL
  USING (
    conversation_id IN (
      SELECT c.id FROM public.conversations c
      JOIN public.parent_connections pc ON c.connection_id = pc.id
      WHERE (pc.parent_1_id = auth.uid() OR pc.parent_2_id = auth.uid()) AND pc.status = 'active'
    )
  );

-- Calendar events: shared events visible to connected parents, personal to owner
CREATE POLICY "Parents can manage calendar events"
  ON public.calendar_events FOR ALL
  USING (
    parent_id = auth.uid()
    OR (is_shared = true AND connection_id IN (
      SELECT id FROM public.parent_connections
      WHERE (parent_1_id = auth.uid() OR parent_2_id = auth.uid()) AND status = 'active'
    ))
  );

-- Care schedules: parents linked to the child
CREATE POLICY "Parents can access care schedules"
  ON public.care_schedules FOR ALL
  USING (
    child_id IN (SELECT child_id FROM public.child_parents WHERE parent_id = auth.uid())
  );

CREATE POLICY "Parents can access care exceptions"
  ON public.care_exceptions FOR ALL
  USING (
    schedule_id IN (
      SELECT cs.id FROM public.care_schedules cs
      WHERE cs.child_id IN (SELECT child_id FROM public.child_parents WHERE parent_id = auth.uid())
    )
  );

-- Expenses: connected parents
CREATE POLICY "Parents can manage expenses"
  ON public.expenses FOR ALL
  USING (
    parent_id = auth.uid()
    OR connection_id IN (
      SELECT id FROM public.parent_connections
      WHERE (parent_1_id = auth.uid() OR parent_2_id = auth.uid()) AND status = 'active'
    )
  );

-- Tasks: connected parents
CREATE POLICY "Parents can manage tasks"
  ON public.tasks FOR ALL
  USING (
    connection_id IN (
      SELECT id FROM public.parent_connections
      WHERE (parent_1_id = auth.uid() OR parent_2_id = auth.uid()) AND status = 'active'
    )
    OR (connection_id IS NULL AND assigned_to = auth.uid())
  );

-- Belongings: parents linked to the child
CREATE POLICY "Parents can manage belongings"
  ON public.belongings FOR ALL
  USING (
    child_id IN (SELECT child_id FROM public.child_parents WHERE parent_id = auth.uid())
  );

-- Agreements: connected parents
CREATE POLICY "Parents can manage agreements"
  ON public.agreements FOR ALL
  USING (
    connection_id IN (
      SELECT id FROM public.parent_connections
      WHERE (parent_1_id = auth.uid() OR parent_2_id = auth.uid()) AND status = 'active'
    )
  );

-- Documents: owner or shared with connected parent
CREATE POLICY "Parents can manage documents"
  ON public.documents FOR ALL
  USING (
    parent_id = auth.uid()
    OR (is_shared = true AND connection_id IN (
      SELECT id FROM public.parent_connections
      WHERE (parent_1_id = auth.uid() OR parent_2_id = auth.uid()) AND status = 'active'
    ))
  );

-- Moments: based on sharing level
CREATE POLICY "Parents can manage moments"
  ON public.moments FOR ALL
  USING (
    parent_id = auth.uid()
    OR (shared_with = 'parents' AND child_id IN (
      SELECT child_id FROM public.child_parents WHERE parent_id = auth.uid()
    ))
  );

-- Holidays: connected parents
CREATE POLICY "Parents can manage holidays"
  ON public.holidays FOR ALL
  USING (
    connection_id IN (
      SELECT id FROM public.parent_connections
      WHERE (parent_1_id = auth.uid() OR parent_2_id = auth.uid()) AND status = 'active'
    )
    OR proposed_by = auth.uid()
  );

-- Audit log: INSERT only, visible to relevant parents
CREATE POLICY "Users can insert audit entries"
  ON public.audit_log FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can read own audit entries"
  ON public.audit_log FOR SELECT
  USING (user_id = auth.uid());

-- NO UPDATE or DELETE policies on audit_log — append-only enforced by RLS

-- Notifications: own only
CREATE POLICY "Users can manage own notifications"
  ON public.notifications FOR ALL
  USING (user_id = auth.uid());

-- Circle members: parents linked to the child
CREATE POLICY "Parents can manage circle members"
  ON public.circle_members FOR ALL
  USING (
    child_id IN (SELECT child_id FROM public.child_parents WHERE parent_id = auth.uid())
  );
```

### 4.3 Realtime Subscriptions (Messages)

```typescript
// In useConversations hook
useEffect(() => {
  if (!connectionId) return

  const channel = supabase
    .channel(`messages:${connectionId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => {
        queryClient.invalidateQueries({ queryKey: ['messages', conversationId] })
      }
    )
    .subscribe()

  return () => { supabase.removeChannel(channel) }
}, [connectionId, conversationId])
```

### 4.4 Feature-by-Feature Connection Guide

Each feature follows this same pattern:

#### Pattern: Migrating a Store

```
1. Keep the existing store file (don't delete!)
2. Create a new hook: src/hooks/use<Feature>.ts
3. Hook uses @tanstack/react-query for data fetching from Supabase
4. Complex mutations → call Edge Function
5. Simple CRUD → direct Supabase client (RLS protects)
6. Image uploads → Supabase Storage Bucket
7. Update the route file to use the new hook
8. Old store becomes a fallback for demo mode
```

#### Example: Migrating Expenses (`kosten-store.ts`)

**New file: `src/hooks/useExpenses.ts`**

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from './useAuth'

export function useExpenses() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['expenses', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .order('date', { ascending: false })
      if (error) throw error
      return data
    },
    enabled: !!user,
  })

  const addExpense = useMutation({
    mutationFn: async (expense: Omit<Expense, 'id' | 'created_at'>) => {
      // If there's a receipt image, upload to bucket first
      let receiptUrl: string | null = null
      if (expense.receiptFile) {
        receiptUrl = await uploadToBucket('receipts', expense.receiptFile)
      }

      const { data, error } = await supabase
        .from('expenses')
        .insert({ ...expense, receipt_url: receiptUrl })
        .select()
        .single()
      if (error) throw error

      // Log to audit via Edge Function
      await supabase.functions.invoke('log-audit', {
        body: { section: 'expenses', item_id: data.id, action: 'created', item_label: expense.description }
      })

      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] })
    },
  })

  return { expenses: query.data ?? [], loading: query.isLoading, addExpense }
}
```

### 4.5 Milestone 2 — Feature Checklist

| # | Feature | Old Store | New Hook | DB Table | Status |
|---|---------|-----------|----------|----------|--------|
| 1 | Home dashboard | `demo-data.ts`, `living-home.ts` | `useDashboard` | (reads from multiple) | ⏳ |
| 2 | Calendar | `afspraken-store.ts` | `useCalendar` | `calendar_events` | ⏳ |
| 3 | Messaging | `gesprekken-store.ts` | `useConversations` + realtime | `conversations`, `messages` | ⏳ |
| 4 | AI coach | `coach.functions.ts` | Edge Function `ai-coach` | — | ⏳ |
| 5 | Child profiles | `demo-data.ts` | `useChildren` | `children` | ⏳ |
| 6 | Expenses | `kosten-store.ts` | `useExpenses` | `expenses` | ⏳ |
| 7 | Tasks | `taken-store.ts` | `useTasks` | `tasks` | ⏳ |
| 8 | Belongings | `taken-store.ts` | `useBelongings` | `belongings` | ⏳ |
| 9 | Handovers | `wissel-store.ts` | `useHandovers` | (reads schedules + belongings) | ⏳ |
| 10 | Holidays | `vakantie-store.ts` | `useHolidays` | `holidays` | ⏳ |
| 11 | Agreements | `afspraken-store.ts` | `useAgreements` | `agreements` | ⏳ |
| 12 | Documents | — | `useDocuments` + Bucket | `documents` | ⏳ |
| 13 | Moments | `momentjes-store.ts` | `useMoments` + Bucket | `moments` | ⏳ |
| 14 | Family circle | `kring-store.ts` | `useCircle` | `circle_members` | ⏳ |
| 15 | Care schedule | `zorg-store.ts` | `useCareSchedule` | `care_schedules`, `care_exceptions` | ⏳ |
| 16 | Audit log | `audit-store.ts` | `useAudit` | `audit_log` | ⏳ |
| 17 | Notifications | — | `useNotifications` | `notifications` | ⏳ |

---

## 5. Milestone 3 — Professional Environment

### Additional Tables

```sql
CREATE TABLE public.professionals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  organization TEXT,
  job_title TEXT,
  specialization TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id UUID NOT NULL REFERENCES public.professionals(id),
  connection_id UUID NOT NULL REFERENCES public.parent_connections(id),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'closed')),
  internal_summary TEXT,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.cases(id),
  professional_id UUID NOT NULL REFERENCES public.professionals(id),
  type TEXT NOT NULL CHECK (type IN ('note', 'action', 'meeting', 'signal')),
  content TEXT NOT NULL,
  visible_to_parents BOOLEAN NOT NULL DEFAULT false,
  parent_facing_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

> **Rule from AGENTS.md**: Professional journal visibility has NO default. Parents use `parent_facing_text`, never internal notes. Closed cards show only one's own summary.

---

## 6. Milestone 4 — Payments, i18n, Apps

### Stripe Integration

```bash
npm install @stripe/stripe-js stripe
```

- Server-side: `stripe` package in Edge Functions (not browser)
- Client-side: `@stripe/stripe-js` for checkout UI
- Plans stored in Supabase, synced via Stripe webhook Edge Function

### i18n Setup

```bash
npm install i18next react-i18next
```

- Extract all Dutch strings to `public/locales/nl/translation.json`
- Create `public/locales/en/translation.json`
- Wrap app with `I18nextProvider`

### Native Apps

- Use Capacitor to wrap the web app:
```bash
npm install @capacitor/core @capacitor/cli
npx cap init
npx cap add ios
npx cap add android
```

---

## 7. Edge Functions Reference

> **All server-side logic is implemented as Supabase Edge Functions.**
> No database functions, no triggers, no PL/pgSQL.

### Edge Function Directory Structure

```
supabase/
└── functions/
    ├── create-profile/
    │   └── index.ts          # Create profile on first sign-up
    ├── send-invitation/
    │   └── index.ts          # Send parent invitation email
    ├── accept-invitation/
    │   └── index.ts          # Accept invitation → link parents + share children
    ├── log-audit/
    │   └── index.ts          # Append audit log entry
    ├── ai-coach/
    │   └── index.ts          # Rewrite message in constructive tone (OpenAI)
    ├── ai-summarize/
    │   └── index.ts          # Summarize conversation thread (OpenAI)
    ├── ai-assistant/
    │   └── index.ts          # Smart assistant intent detection (OpenAI)
    ├── ai-school-info/
    │   └── index.ts          # Extract school info from document (OpenAI)
    ├── ai-parenting-plan/
    │   └── index.ts          # Import parenting plan agreements (OpenAI)
    ├── send-notification/
    │   └── index.ts          # Create in-app notification
    ├── accept-proposal/
    │   └── index.ts          # Accept a shared proposal (agenda/agreement/schedule)
    ├── close-case/
    │   └── index.ts          # Professional closes a case
    └── stripe-webhook/
        └── index.ts          # Handle Stripe payment events
```

### Edge Function Pattern

Every Edge Function follows this structure:

```typescript
// supabase/functions/create-profile/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    // 1. Verify auth
    const authHeader = req.headers.get('Authorization')!
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
    }

    // 2. Parse request
    const { name } = await req.json()

    // 3. Use service role client for admin operations
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // 4. Check if profile already exists
    const { data: existing } = await adminClient
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .single()

    if (existing) {
      return new Response(JSON.stringify({ message: 'Profile already exists' }), { status: 200 })
    }

    // 5. Create profile
    const { data, error } = await adminClient
      .from('profiles')
      .insert({ id: user.id, name: name || 'Gebruiker' })
      .select()
      .single()

    if (error) throw error

    return new Response(JSON.stringify(data), { status: 201 })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
})
```

### Edge Function: Accept Invitation (Complex Logic)

```typescript
// supabase/functions/accept-invitation/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    const authHeader = req.headers.get('Authorization')!
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return new Response('Unauthorized', { status: 401 })

    const { token } = await req.json()

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // 1. Find invitation by token
    const { data: invitation, error: invErr } = await adminClient
      .from('invitations')
      .select('*')
      .eq('token', token)
      .eq('status', 'sent')
      .single()

    if (invErr || !invitation) {
      return new Response(JSON.stringify({ error: 'Invitation not found or expired' }), { status: 404 })
    }

    // 2. Check not expired
    if (new Date(invitation.expires_at) < new Date()) {
      await adminClient.from('invitations').update({ status: 'expired' }).eq('id', invitation.id)
      return new Response(JSON.stringify({ error: 'Invitation has expired' }), { status: 410 })
    }

    // 3. Check not self-invite
    if (invitation.from_parent_id === user.id) {
      return new Response(JSON.stringify({ error: 'Cannot accept own invitation' }), { status: 400 })
    }

    // 4. Update invitation status
    await adminClient.from('invitations').update({
      status: 'accepted',
      accepted_at: new Date().toISOString(),
      to_parent_id: user.id,
    }).eq('id', invitation.id)

    // 5. Create parent connection
    const { data: connection } = await adminClient.from('parent_connections').insert({
      parent_1_id: invitation.from_parent_id,
      parent_2_id: user.id,
      invitation_id: invitation.id,
    }).select().single()

    // 6. Link accepting parent to shared children
    for (const childId of invitation.child_ids) {
      await adminClient.from('child_parents').upsert({
        child_id: childId,
        parent_id: user.id,
        role: 'parent',
      }, { onConflict: 'child_id,parent_id' })
    }

    // 7. Log audit
    await adminClient.from('audit_log').insert({
      user_id: user.id,
      section: 'invitation',
      item_id: invitation.id,
      action: 'accepted',
      item_label: `Invitation from ${invitation.from_parent_id}`,
    })

    return new Response(JSON.stringify({ connection, childIds: invitation.child_ids }), { status: 200 })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
})
```

### Edge Function: AI Coach (OpenAI)

```typescript
// supabase/functions/ai-coach/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import OpenAI from 'https://esm.sh/openai@4'

serve(async (req) => {
  try {
    const authHeader = req.headers.get('Authorization')!
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return new Response('Unauthorized', { status: 401 })

    const { text, context } = await req.json()
    if (!text) return new Response(JSON.stringify({ error: 'Text is required' }), { status: 400 })

    const openai = new OpenAI({ apiKey: Deno.env.get('OPENAI_API_KEY')! })

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Je bent een communicatiecoach voor gescheiden ouders.
            Herformuleer het bericht zodat het constructief, neutraal en
            kindgericht is. Behoud de kernboodschap. Antwoord alleen met
            de herformulering, geen uitleg.`
        },
        { role: 'user', content: text }
      ],
      max_tokens: 500,
    })

    return new Response(JSON.stringify({
      rewritten: response.choices[0].message.content,
      original: text,
    }), { status: 200 })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
})
```

### Calling Edge Functions from Frontend

```typescript
// From any component or hook:
const { data, error } = await supabase.functions.invoke('ai-coach', {
  body: { text: 'Je bent altijd te laat met ophalen!' }
})

// data = { rewritten: "Kun je proberen om op tijd te zijn bij het ophalen?", original: "..." }
```

### Deploying Edge Functions

```bash
# Deploy a single function
supabase functions deploy create-profile

# Deploy all functions
supabase functions deploy

# Set secrets for Edge Functions
supabase secrets set OPENAI_API_KEY=sk-...
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

---

## 8. Storage Buckets & Image Uploads

### Create Buckets (Supabase Dashboard or SQL)

```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES
  ('avatars', 'avatars', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('receipts', 'receipts', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('documents', 'documents', false, 52428800, ARRAY['application/pdf', 'image/jpeg', 'image/png', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
  ('moments', 'moments', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4']);
```

### Storage RLS Policies

```sql
-- Avatars: public read, authenticated upload to own folder
CREATE POLICY "Avatar public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can update own avatar"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Receipts: only owner and connected parent
CREATE POLICY "Parents can upload receipts"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Parents can view receipts"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'receipts'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR (storage.foldername(name))[1] IN (
        SELECT parent_2_id::text FROM public.parent_connections WHERE parent_1_id = auth.uid() AND status = 'active'
        UNION
        SELECT parent_1_id::text FROM public.parent_connections WHERE parent_2_id = auth.uid() AND status = 'active'
      )
    )
  );

-- Documents: same pattern as receipts
CREATE POLICY "Parents can upload documents"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Parents can view documents"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'documents'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR (storage.foldername(name))[1] IN (
        SELECT parent_2_id::text FROM public.parent_connections WHERE parent_1_id = auth.uid() AND status = 'active'
        UNION
        SELECT parent_1_id::text FROM public.parent_connections WHERE parent_2_id = auth.uid() AND status = 'active'
      )
    )
  );

-- Moments: owner and shared parents
CREATE POLICY "Parents can upload moment photos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'moments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Parents can view moment photos"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'moments'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR (storage.foldername(name))[1] IN (
        SELECT parent_2_id::text FROM public.parent_connections WHERE parent_1_id = auth.uid() AND status = 'active'
        UNION
        SELECT parent_1_id::text FROM public.parent_connections WHERE parent_2_id = auth.uid() AND status = 'active'
      )
    )
  );
```

### Upload Helper Function (`src/lib/storage.ts`)

```typescript
import { supabase } from './supabase'

/**
 * Upload a file to a Supabase Storage bucket.
 * Files are stored under: {bucket}/{userId}/{timestamp}_{filename}
 * Returns the public URL (for avatars) or a path for signed URLs.
 */
export async function uploadToBucket(
  bucket: 'avatars' | 'receipts' | 'documents' | 'moments',
  file: File,
  userId: string
): Promise<string> {
  const timestamp = Date.now()
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${userId}/${timestamp}_${safeName}`

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    })

  if (error) throw error

  // For public buckets (avatars), return public URL
  if (bucket === 'avatars') {
    const { data } = supabase.storage.from(bucket).getPublicUrl(path)
    return data.publicUrl
  }

  // For private buckets, return the path (use signed URLs to access)
  return path
}

/**
 * Get a signed URL for a private file (expires in 1 hour).
 */
export async function getSignedUrl(
  bucket: 'receipts' | 'documents' | 'moments',
  path: string
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 3600) // 1 hour

  if (error) throw error
  return data.signedUrl
}

/**
 * Delete a file from a bucket.
 */
export async function deleteFromBucket(
  bucket: 'avatars' | 'receipts' | 'documents' | 'moments',
  path: string
): Promise<void> {
  const { error } = await supabase.storage.from(bucket).remove([path])
  if (error) throw error
}
```

### Usage Examples

```typescript
// Upload avatar (public)
const avatarUrl = await uploadToBucket('avatars', file, user.id)
await supabase.from('profiles').update({ avatar_url: avatarUrl }).eq('id', user.id)

// Upload receipt (private)
const receiptPath = await uploadToBucket('receipts', file, user.id)
await supabase.from('expenses').insert({ ..., receipt_url: receiptPath })

// Display private image
const signedUrl = await getSignedUrl('receipts', expense.receipt_url)
// Use signedUrl in <img src={signedUrl} />

// Upload moment photo (private, shared with co-parent)
const photoPath = await uploadToBucket('moments', file, user.id)
await supabase.from('moments').insert({ ..., photo_url: photoPath })

// Upload document (private)
const docPath = await uploadToBucket('documents', file, user.id)
await supabase.from('documents').insert({ ..., file_url: docPath })
```

---

## 9. Store Migration Pattern

### Step-by-step for EVERY store:

```
1. DON'T delete the existing store
2. Create new hook in src/hooks/
3. Hook reads from Supabase via react-query
4. Complex mutations → call Edge Function (supabase.functions.invoke)
5. Simple CRUD → direct Supabase client (RLS protects)
6. Image/file fields → upload to Storage Bucket, store path in DB
7. Mutations also call Edge Function "log-audit" for history
8. Update route to use new hook
9. Keep old store as demo-mode fallback
10. Test: CRUD + permissions + file upload + offline + refresh
```

### Demo Mode Toggle

```typescript
// src/lib/mode.ts
export function isDemoMode(): boolean {
  return !import.meta.env.VITE_SUPABASE_URL || import.meta.env.DEV
}
```

Routes can conditionally use old stores or new hooks based on auth state.

### Table Name Mapping (Dutch Store → English DB)

| Old Store (Dutch) | New DB Table (English) | New Hook |
|-------------------|----------------------|----------|
| `kosten-store.ts` | `expenses` | `useExpenses` |
| `taken-store.ts` | `tasks` + `belongings` | `useTasks`, `useBelongings` |
| `afspraken-store.ts` | `agreements` | `useAgreements` |
| `gesprekken-store.ts` | `conversations` + `messages` | `useConversations` |
| `vakantie-store.ts` | `holidays` | `useHolidays` |
| `momentjes-store.ts` | `moments` | `useMoments` |
| `kring-store.ts` | `circle_members` | `useCircle` |
| `zorg-store.ts` | `care_schedules` + `care_exceptions` | `useCareSchedule` |
| `audit-store.ts` | `audit_log` | `useAudit` |
| `wissel-store.ts` | (reads `care_schedules` + `belongings`) | `useHandovers` |
| `start-store.ts` | `profiles` (onboarding fields) | `useProfile` |
| `pro-journaal-store.ts` | `cases` + `journal_entries` | `useCases` |
| `demo-data.ts` kinderen | `children` | `useChildren` |
| `bijzondere-dagen.ts` | `holidays` (type = special_day) | `useHolidays` |
| `budget-store.ts` | `expenses` (budget category) | `useExpenses` |
| `nu-afstemmen-store.ts` | Edge Function + `notifications` | `useUrgentItems` |

---

## 10. File Structure for New Code

```
supabase/
└── functions/                    # ALL Edge Functions (NEW)
    ├── create-profile/index.ts
    ├── send-invitation/index.ts
    ├── accept-invitation/index.ts
    ├── log-audit/index.ts
    ├── ai-coach/index.ts
    ├── ai-summarize/index.ts
    ├── ai-assistant/index.ts
    ├── ai-school-info/index.ts
    ├── ai-parenting-plan/index.ts
    ├── send-notification/index.ts
    ├── accept-proposal/index.ts
    ├── close-case/index.ts
    └── stripe-webhook/index.ts

src/
├── lib/
│   ├── supabase.ts              # Browser Supabase client (NEW)
│   ├── storage.ts               # Upload/download helpers for Buckets (NEW)
│   ├── database.types.ts        # Auto-generated types (NEW)
│   ├── mode.ts                  # Demo vs production toggle (NEW)
│   ├── ... (existing stores — keep!)
│
├── hooks/
│   ├── useAuth.ts               # Auth state + methods (NEW)
│   ├── useProfile.ts            # Current user profile (NEW)
│   ├── useChildren.ts           # Children CRUD (NEW)
│   ├── useConnection.ts         # Parent connection (NEW)
│   ├── useInvitation.ts         # Invitation flow via Edge Function (NEW)
│   ├── useCalendar.ts           # Calendar events (NEW)
│   ├── useConversations.ts      # Messages + realtime (NEW)
│   ├── useExpenses.ts           # Expenses + receipt uploads (NEW)
│   ├── useTasks.ts              # Tasks (NEW)
│   ├── useBelongings.ts         # Belongings (NEW)
│   ├── useAgreements.ts         # Agreements (NEW)
│   ├── useDocuments.ts          # Documents + bucket uploads (NEW)
│   ├── useMoments.ts            # Shared moments + photo uploads (NEW)
│   ├── useCircle.ts             # Family circle (NEW)
│   ├── useCareSchedule.ts       # Care schedule (NEW)
│   ├── useAudit.ts              # Audit log (NEW)
│   ├── useNotifications.ts      # Notifications (NEW)
│   ├── useHolidays.ts           # Holidays (NEW)
│   ├── useHandovers.ts          # Handovers (reads multiple tables) (NEW)
│   └── ... (existing hooks — keep!)
│
├── routes/
│   ├── login.tsx                # Login page (NEW)
│   ├── registreren.tsx          # Registration page (NEW)
│   ├── wachtwoord-vergeten.tsx  # Forgot password (NEW)
│   ├── wachtwoord-reset.tsx     # Reset password (NEW)
│   ├── ... (existing routes — keep & update!)
│
├── components/
│   ├── AuthGuard.tsx            # Auth protection (NEW)
│   ├── ImageUpload.tsx          # Reusable image upload to bucket (NEW)
│   ├── ... (existing components — keep!)
```

---

## 11. Priority Order for Development

```
Week 1-2: Supabase setup + schema + RLS + Edge Functions (create-profile, send/accept-invitation) + auth pages
Week 3:   Parent linking + invitation flow + child profiles + avatar uploads
Week 4:   Testing Milestone 1 → client review

Week 5-6: Migrate core stores (messages + realtime, calendar, costs + receipt uploads)
Week 7-8: Migrate remaining stores + AI Edge Functions + document uploads
Week 9:   Responsive testing + edge cases
Week 10:  Testing Milestone 2 → client review
```

---

## 12. Critical Rules Reminder

> [!CAUTION]
> **From the client brief — these are contractual obligations:**

1. **Never replace** — extend the existing code
2. **Never hard-code** demo data as production
3. **Never weaken RLS** to make a screen work
4. **Never auto-share** private information
5. **Never expose** API keys in frontend code — all secrets live in Edge Function environment
6. **Always test** end-to-end before marking complete
7. **Always raise** scope concerns with client before omitting features
8. **Always preserve** the existing visual design and branding
9. **All server logic** goes through Edge Functions — no database functions/triggers
10. **All file uploads** go through Storage Buckets with proper RLS policies
