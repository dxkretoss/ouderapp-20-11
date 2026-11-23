# Co-Parent Invitation & Linking Flow Implementation Guide

**Date**: 2026-10-16  
**Status**: Live & Deployed  
**Supabase Project**: `hbimbzwcdmhnxxdbbugw`  

---

## 1. Overview & Architecture

This module implements the complete lifecycle for inviting a second parent to co-parenting, linking their accounts to the children, and transitioning both parents from **Solo** mode to **Together** mode.

```
       [Parent A (Solo / Initiator)]
                   │
                   ▼
       Calls `send-invitation` Edge Function
                   │
    ┌──────────────┴──────────────┐
    ▼                             ▼
Web Universal Link          App Deep Link
/uitnodiging?token=...      ouderapp://invite?token=...
    │                             │
    └──────────────┬──────────────┘
                   ▼
       [Parent B (Recipient)]
                   │
                   ▼ Opens link
       Calls `accept-invitation` { action: 'inspect' } (No Auth required)
       Shows: Inviting Parent Name, Children to share
                   │
                   ▼ Parent B Logs In / Registers
       Calls `accept-invitation` { action: 'accept' } (Authenticated)
                   │
       ┌───────────┴─────────────────────────────┐
       ▼                                         ▼
1. `invitations`: status = 'accepted'     3. `parent_connections`: inserted
2. `child_parents`: upserted              4. `profiles.usage_mode`: set to 'together'
```

---

## 2. Serverless Edge Functions

### A. `send-invitation`
- **URL**: `https://hbimbzwcdmhnxxdbbugw.supabase.co/functions/v1/send-invitation`
- **Method**: `POST`
- **Auth**: Flexible (Bearer JWT in `Authorization` header **OR** `from_parent_id` in JSON body).
- **Request Body**:
```json
{
  "toEmail": "alex@voorbeeld.nl",
  "childIds": ["a572c672-97b7-4d7c-87d2-7a8efb50fb6b"],
  "from_parent_id": "40203e40-fa91-450f-bc7a-5db0425dc8f5"
}
```
- **Response** (`201 Created`):
```json
{
  "success": true,
  "invitation": {
    "id": "c1f7b7f1-...",
    "from_parent_id": "40203e40-fa91-450f-bc7a-5db0425dc8f5",
    "to_email": "alex@voorbeeld.nl",
    "token": "49bf55e390c5415286236fae70a7df8448f10bf8",
    "status": "pending",
    "child_ids": ["a572c672-97b7-4d7c-87d2-7a8efb50fb6b"],
    "expires_at": "2026-11-15T09:00:00.000Z"
  },
  "token": "49bf55e390c5415286236fae70a7df8448f10bf8",
  "inviteLink": "http://localhost:5173/uitnodiging?token=49bf55e390c5415286236fae70a7df8448f10bf8",
  "deepLink": "ouderapp://invite?token=49bf55e390c5415286236fae70a7df8448f10bf8",
  "message": "Invitation generated successfully."
}
```

---

### B. `accept-invitation` (Action: `inspect`)
Allows previewing the invitation sender and child details before logging in.

- **URL**: `https://hbimbzwcdmhnxxdbbugw.supabase.co/functions/v1/accept-invitation`
- **Method**: `POST`
- **Auth**: None required.
- **Request Body**:
```json
{
  "action": "inspect",
  "token": "49bf55e390c5415286236fae70a7df8448f10bf8"
}
```
- **Response** (`200 OK`):
```json
{
  "success": true,
  "invitation": {
    "id": "c1f7b7f1-...",
    "token": "49bf55e390c5415286236fae70a7df8448f10bf8",
    "status": "pending",
    "to_email": "alex@voorbeeld.nl",
    "expires_at": "2026-11-15T09:00:00.000Z",
    "is_expired": false,
    "is_already_accepted": false,
    "from_parent": {
      "id": "40203e40-fa91-450f-bc7a-5db0425dc8f5",
      "name": "Sanne",
      "email": "sanne@example.com"
    },
    "children": [
      {
        "id": "a572c672-97b7-4d7c-87d2-7a8efb50fb6b",
        "name": "Emma",
        "last_name": "van der Berg",
        "avatar_url": null,
        "color_code": "#3C6E71",
        "date_of_birth": "2018-05-12"
      }
    ]
  }
}
```

---

### C. `accept-invitation` (Action: `accept`)
Accepts the invitation, establishes the co-parenting connection, links shared children, and updates usage modes.

- **URL**: `https://hbimbzwcdmhnxxdbbugw.supabase.co/functions/v1/accept-invitation`
- **Method**: `POST`
- **Auth**: Flexible (Bearer JWT in `Authorization` header **OR** `user_id` / `parent_id` in JSON body).
- **Request Body**:
```json
{
  "action": "accept",
  "token": "49bf55e390c5415286236fae70a7df8448f10bf8",
  "user_id": "78b4a2e5-4f40-4f51-b8ef-56b1a3e62f99"
}
```
- **Response** (`200 OK`):
```json
{
  "success": true,
  "message": "Invitation successfully accepted! You are now connected as co-parents.",
  "connection": {
    "id": "e2a14917-...",
    "parent_1_id": "40203e40-fa91-450f-bc7a-5db0425dc8f5",
    "parent_2_id": "78b4a2e5-4f40-4f51-b8ef-56b1a3e62f99",
    "status": "active"
  },
  "accepting_parent": {
    "id": "78b4a2e5-4f40-4f51-b8ef-56b1a3e62f99",
    "name": "Alex",
    "email": "alex@voorbeeld.nl",
    "usage_mode": "together"
  },
  "co_parent": {
    "id": "40203e40-fa91-450f-bc7a-5db0425dc8f5",
    "name": "Sanne",
    "email": "sanne@example.com",
    "usage_mode": "together"
  },
  "children": [
    {
      "id": "a572c672-97b7-4d7c-87d2-7a8efb50fb6b",
      "name": "Emma"
    }
  ]
}
```

---

## 3. Web Client Implementation Files

| File | Purpose |
| :--- | :--- |
| [`src/lib/invitation-service.js`](file:///d:/ouderapp_react/src/lib/invitation-service.js) | Client SDK for sending, inspecting, accepting, and cancelling co-parent invitations. |
| [`src/components/InviteCoParentSheet.jsx`](file:///d:/ouderapp_react/src/components/InviteCoParentSheet.jsx) | Interactive bottom sheet with child selection, link generation, 1-click clipboard copy, and WhatsApp/Email sharing buttons. |
| [`src/routes/invitation.jsx`](file:///d:/ouderapp_react/src/routes/invitation.jsx) | Route `/uitnodiging?token=...`: live invitation verification, children preview, inline login/signup, and immediate connection. |
| [`src/routes/solo.jsx`](file:///d:/ouderapp_react/src/routes/solo.jsx) | Upgraded Solo Mode screen with "Invite co-parent & continue together" CTA. |
| [`src/routes/children.index.jsx`](file:///d:/ouderapp_react/src/routes/children.index.jsx) | Children screen with Mode status pill and "Invite Co-Parent" button. |
| [`src/routes/index.jsx`](file:///d:/ouderapp_react/src/routes/index.jsx) | Home dashboard Quick Actions with prominent Solo invite banner. |

---

## 4. Mobile (Flutter) Deep Link Handling

To handle incoming invitation links on Android & iOS:

### Android (`android/app/src/main/AndroidManifest.xml`):
```xml
<intent-filter android:autoVerify="true">
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="ouderapp" android:host="invite" />
</intent-filter>
```

### iOS (`ios/Runner/Info.plist`):
```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>ouderapp</string>
    </array>
    <key>CFBundleURLName</key>
    <string>com.ouderapp.invite</string>
  </dict>
</array>
```

When the app opens with `ouderapp://invite?token=<TOKEN>`:
1. Parse query parameter `token`.
2. Call `accept-invitation` with `{ action: 'inspect', token }`.
3. Display the invitation acceptance screen.
