# Ouderschap & Co — Mobile App Developer Guide (iOS & Android)

> **Document Version**: 1.0.0  
> **Target Platforms**: iOS (Swift / React Native / Flutter) & Android (Kotlin / React Native / Flutter)  
> **Backend Engine**: Supabase (PostgreSQL 15, Auth, Storage, Realtime, **Edge Functions**)  
> **Postman Collection**: `docs/Ouderschap_Co_API.postman_collection.json`

---

## 1. Unified Architecture Overview

Ouderschap & Co uses a **single, unified backend** for both the Web application and Native Mobile Apps (iOS & Android).

```
                     ┌────────────────────────┐
                     │   React Web App (SPA)  │
                     └───────────┬────────────┘
                                 │
┌───────────────────────┐        │        ┌───────────────────────┐
│     iOS Native App    ├────────┼────────┤   Android Native App  │
│ (React Native/Flutter)│        │        │ (React Native/Flutter)│
└───────────┬───────────┘        │        └───────────┬───────────┘
            │                    │                    │
            └────────────────────┼────────────────────┘
                                 ▼
                   ┌───────────────────────────┐
                   │     Supabase Backend      │
                   ├───────────────────────────┤
                   │  • Supabase Auth (JWT)    │
                   │  • PostgreSQL DB + RLS    │
                   │  • Supabase Edge Functions│
                   │  • Realtime WebSockets    │
                   │  • Storage Buckets        │
                   └───────────────────────────┘
```

### Key Architectural Tenets
1. **Zero Database Direct Business Logic**: Mobile clients NEVER execute complex business transactions directly against raw tables. Instead, they invoke **Supabase Edge Functions** for atomic operations (invitations, proposals, AI tone coaching, audit logging).
2. **Row Level Security (RLS)**: Direct REST queries for fetching children, expenses, messages, or calendar events are enforced strictly at the database layer via RLS policies matching the user's JWT.
3. **Identical Data Formats**: Table column names and JSON API fields are strictly in **English** (`profiles`, `children`, `expenses`, `messages`).

---

## 2. Quick Setup for Mobile

### A. React Native (Expo / CLI)
Install the official Supabase client and URL polyfills:
```bash
npm install @supabase/supabase-js @react-native-async-storage/async-storage react-native-url-polyfill
```

Initialize the client (`src/services/supabase.js`):
```javascript
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://YOUR_PROJECT_REF.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
```

### B. Flutter
Add to `pubspec.yaml`:
```yaml
dependencies:
  supabase_flutter: ^2.8.0
```

Initialize in `main.dart`:
```dart
void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Supabase.initialize(
    url: 'https://YOUR_PROJECT_REF.supabase.co',
    anonKey: 'YOUR_ANON_KEY',
  );
  runApp(const MyApp());
}
```

---

## 3. Authentication & Deep Linking Flow

### Registration & Login
Parents can register independently. No parent is forced to connect to another parent upon initial registration.

```javascript
// 1. Sign up
const { data, error } = await supabase.auth.signUp({
  email: 'ouder@voorbeeld.nl',
  password: 'Password123!',
  options: { data: { name: 'Sanne' } },
});

// 2. Automatically create profile via Edge Function
await supabase.functions.invoke('create-profile', {
  body: { name: 'Sanne', usage_mode: 'together' },
});

// 3. Login
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'ouder@voorbeeld.nl',
  password: 'Password123!',
});
```

### Parent Linking via Deep Link
When a parent sends an invitation, a neutral link and deep link token are generated:
- Web Link: `https://app.ouderapp.nl/uitnodiging?token=XYZ`
- Native Deep Link: `ouderapp://invite?token=XYZ`

Configure native URL scheme:
- **iOS**: In `Info.plist`, add URL Scheme `ouderapp`.
- **Android**: In `AndroidManifest.xml`, add intent filter with scheme `ouderapp` and host `invite`.

When the app opens from the link, extract the token and call:
```javascript
const { data, error } = await supabase.functions.invoke('accept-invitation', {
  body: { token: inviteToken },
});
if (!error) {
  // Family successfully linked; child profiles now shared!
}
```

---

## 4. Edge Functions Reference

All business logic Edge Functions reside in `supabase/functions/` and are invoked with:
`supabase.functions.invoke(functionName, { body: { ... } })`

| Function | Endpoint | Description |
|---|---|---|
| `create-profile` | `POST /functions/v1/create-profile` | Creates profile upon signup |
| `send-invitation` | `POST /functions/v1/send-invitation` | Dispatches co-parent invitation |
| `accept-invitation` | `POST /functions/v1/accept-invitation` | Links parents and shares children |
| `ai-coach` | `POST /functions/v1/ai-coach` | Rewrites message in calm/constructive tone |
| `ai-assistant` | `POST /functions/v1/ai-assistant` | AI intent classifier (events, tasks, costs) |
| `send-notification` | `POST /functions/v1/send-notification` | Dispatches APNs / FCM push notifications |
| `log-audit` | `POST /functions/v1/log-audit` | Append-only event history (frozen) |

### Example: Invoking AI Tone Coach from Mobile Chat
```javascript
const { data, error } = await supabase.functions.invoke('ai-coach', {
  body: { text: rawDraftMessage },
});
// data.rewritten contains the calm, child-focused constructive Dutch phrasing
```

---

## 5. Realtime Subscriptions (Live Chat & Updates)

Mobile apps should listen to real-time events for instant messaging without polling:

```javascript
// Subscribe to incoming messages
const channel = supabase
  .channel('public:messages')
  .on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'messages' },
    (payload) => {
      // Append payload.new to current conversation messages state
      console.log('New message received:', payload.new);
    }
  )
  .subscribe();

// Clean up on component unmount
// supabase.removeChannel(channel);
```

---

## 6. Photo & Document Uploads (Storage Buckets)

The application uses 4 Supabase Storage buckets:
- `avatars` (public, read-only to public, authenticated upload)
- `receipts` (private, only paying parent + connected co-parent)
- `documents` (private, passports, medical cards, custody agreements)
- `moments` (private, shared photo moments of the kids)

### Mobile Image Upload Example (React Native / Expo)
```javascript
import * as FileSystem from 'expo-file-system';
import { decode } from 'base64-arraybuffer';

async function uploadReceiptPhoto(imageUri, userId) {
  const base64 = await FileSystem.readAsStringAsync(imageUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const fileName = `${userId}/${Date.now()}_receipt.jpg`;

  const { data, error } = await supabase.storage
    .from('receipts')
    .upload(fileName, decode(base64), {
      contentType: 'image/jpeg',
    });

  if (error) throw error;
  return data.path; // Store this path in expenses table 'receipt_url' column
}
```

---

## 7. Push Notifications Setup (iOS APNs & Android FCM)

1. When the mobile app starts, request push notification permissions via `expo-notifications` or `react-native-firebase`.
2. Register the device token in the database:
```sql
CREATE TABLE IF NOT EXISTS public.device_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  device_token TEXT NOT NULL UNIQUE,
  platform TEXT CHECK (platform IN ('ios', 'android')),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```
3. Edge Function `send-notification` queries `device_tokens` for the recipient and dispatches via APNs (HTTP/2) or FCM v1 API.

---

## 8. Postman Testing Guide

The Postman collection is located in:
`docs/Ouderschap_Co_API.postman_collection.json`

### How to use:
1. Open Postman -> Click **Import** -> Select `docs/Ouderschap_Co_API.postman_collection.json`.
2. In the collection **Variables** tab, set:
   - `baseUrl`: Your Supabase Project URL (e.g., `https://xyz.supabase.co`)
   - `anonKey`: Your Supabase Anon Key from project API settings.
   - `functionsUrl`: `https://xyz.supabase.co/functions/v1`
3. Run **1. Authentication -> Sign In** to receive your JWT access token.
4. Copy the `access_token` and paste it into the `authToken` collection variable.
5. All subsequent requests (Edge Functions, Children CRUD, Expenses, Messages) will automatically authenticate using this token!
