# Implementation Record: Independent Parent & Child Management Flow

> **Date**: October 16, 2026  
> **Status**: Completed & Verified  
> **Target Platforms**: Web (React / Vite) & Mobile (Flutter / iOS / Android)  
> **Database Engine**: Supabase PostgreSQL (Custom Stored Procedures / RPC)  

---

## 1. Executive Summary

This document records the complete implementation of the **Independent Parent & Child Management Flow**.
It fulfills two core business requirements:
1. **A parent can register and use the application independently** (`usage_mode`: `together` vs `solo`).
2. **A parent can create and manage child profiles without requiring the other parent to join**.

---

## 2. Modified & Created Files Summary

| [supabase/functions/manage-children/index.ts](file:///d:/ouderapp_react/supabase/functions/manage-children/index.ts) | **Created** | Serverless Edge Function managing full child CRUD (`create`, `list`, `get`, `update`, `delete`, `update_usage_mode`), supporting `gender` and Service Role admin privileges. |
| [supabase/migrations/01_initial_schema.sql](file:///d:/ouderapp_react/supabase/migrations/01_initial_schema.sql) | **Updated** | Added `gender` check constraint, 5 PostgreSQL RPC functions, and table permissions. |
| [src/lib/child-service.js](file:///d:/ouderapp_react/src/lib/child-service.js) | **Updated** | Child management service with Edge Function invocation, supporting `gender`, single child retrieval, and mode switching. |
| [src/components/ChildSheet.jsx](file:///d:/ouderapp_react/src/components/ChildSheet.jsx) | **Updated** | Added required Boy / Girl (Male / Female) selector, future-date disabled (`max=today`), and full validation. |
| [src/components/FirstHome.jsx](file:///d:/ouderapp_react/src/components/FirstHome.jsx) | **Updated** | Onboarding `KindSheet` with required Boy / Girl selector and future-date disabled (`max=today`). |
| [src/routes/children.index.jsx](file:///d:/ouderapp_react/src/routes/children.index.jsx) | **Updated** | Connected children directory to live database and cache, added Solo Mode vs Co-Parenting Mode badges, empty state CTA, and ChildSheet integration. |
| [src/routes/children.$childId.jsx](file:///d:/ouderapp_react/src/routes/children.$childId.jsx) | **Updated** | Enhanced child profile detail page to dynamically display all profile data (school, medical notes, allergies, sizes) without strict ID prefix blocking. |
| [src/routes/index.jsx](file:///d:/ouderapp_react/src/routes/index.jsx) | **Updated** | Made the dashboard Quick Actions widget mode-aware: displays private solo actions ("Children", "Private logbook", "Track costs", "My calendar") when in Solo mode. |
| [docs/FLUTTER_MOBILE_AUTH_API.md](file:///d:/ouderapp_react/docs/FLUTTER_MOBILE_AUTH_API.md) | **Updated** | Documented Section 7 with complete Edge Function specifications, JSON payloads, responses, and a production-ready Flutter `ChildService` implementation. |
| [docs/2026-10-16_INDEPENDENT_PARENT_CHILD_FLOW_IMPLEMENTATION.md](file:///d:/ouderapp_react/docs/2026-10-16_INDEPENDENT_PARENT_CHILD_FLOW_IMPLEMENTATION.md) | **Created** | This master record document. |

---

## 3. Database Architecture & Stored Functions

### Tables Utilized:
- `public.profiles`: Stores parent credentials and `usage_mode` (`together` or `solo`).
- `public.children`: Stores child profiles with `created_by` foreign key referencing the parent.
- `public.child_parents`: Relational junction mapping children to parents with `role` and `can_edit`.

### Implemented Stored Procedures (RPC):

#### 1. `public.custom_create_child(...)`
- **Purpose**: Creates a child record and automatically binds the creator parent in `child_parents`.
- **Arguments**: `p_parent_id`, `p_name`, `p_last_name`, `p_date_of_birth`, `p_avatar_url`, `p_school`, `p_daycare`, `p_doctor`, `p_medical_notes`, `p_clothes_size`, `p_shoe_size`, `p_bsn`, `p_allergies`, `p_dietary_notes`, `p_color_code`.
- **Return**: `{ "success": true, "child": { ... } }`

#### 2. `public.custom_get_my_children(p_parent_id UUID)`
- **Purpose**: Retrieves all children belonging to the requesting parent (independent or shared).
- **Return**: `{ "success": true, "children": [ ... ] }`

#### 3. `public.custom_update_child(...)`
- **Purpose**: Updates child profile data if the parent is authorized.
- **Return**: `{ "success": true, "child": { ... } }`

#### 4. `public.custom_delete_child(p_child_id UUID, p_parent_id UUID)`
- **Purpose**: Deletes a child profile created by the parent.
- **Return**: `{ "success": true, "message": "Child profile deleted." }`

#### 5. `public.custom_update_usage_mode(p_user_id UUID, p_usage_mode TEXT)`
- **Purpose**: Allows parent to toggle or switch between `together` and `solo` mode.

---

## 4. Mobile App Integration Guide (Flutter / React Native)

All endpoints use standard PostgREST RPC via HTTPS:
- **Base Endpoint**: `https://hbimbzwcdmhnxxdbbugw.supabase.co/rest/v1/rpc/<function_name>`
- **HTTP Method**: `POST`
- **Headers**:
  ```http
  apikey: <SUPABASE_ANON_KEY>
  Content-Type: application/json
  ```

### Example Dart Request (Flutter):
```dart
final res = await http.post(
  Uri.parse('https://hbimbzwcdmhnxxdbbugw.supabase.co/rest/v1/rpc/custom_create_child'),
  headers: {
    'apikey': AppConfig.anonKey,
    'Content-Type': 'application/json',
  },
  body: jsonEncode({
    'p_parent_id': currentUserId,
    'p_name': 'Emma',
    'p_date_of_birth': '2018-05-14',
    'p_school': 'De Regenboog',
  }),
);
```

---

## 5. Verification & Testing

- **Compilation Test**: Ran `npm run build` using Vite. Output: `built in 780ms with 0 errors`.
- **Responsive Compatibility**: Verified both mobile viewports (< 768px) and desktop layouts.
- **Bilingual Coverage**: Fully supports both Dutch (`nl`) and English (`en`).
