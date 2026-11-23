# Ouderschap & Co — Flutter Mobile Auth & API Guide (Custom Auth Engine)

> **Document Version**: 3.0.0  
> **Target Audience**: Flutter Mobile Developers (iOS & Android)  
> **Backend Architecture**: 100% Custom Authentication Engine via PostgreSQL Stored Functions (RPC) & Custom Tables  
> **Supabase Auth GoTrue**: **NOT USED** — All authentication uses custom bcrypt hashing, custom sessions, and custom verification codes.  
> **Postman Collection**: [`docs/Ouderschap_Co_API.postman_collection.json`](./Ouderschap_Co_API.postman_collection.json)  
> **Base URL**: `https://hbimbzwcdmhnxxdbbugw.supabase.co`  
> **RPC Endpoint Prefix**: `https://hbimbzwcdmhnxxdbbugw.supabase.co/rest/v1/rpc`  
> **Anon API Key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhiaW1iendjZG1obnh4ZGJidWd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE3MTExMzMsImV4cCI6MjEwNzI4NzEzM30.DzpkFReW44YAjKrMl1EOYt3LipcCf6Ec-NfdxIdlaJQ`

---

## 1. Overview & Architecture

Ouderschap & Co uses a **dedicated custom authentication system** rather than the default Supabase GoTrue Auth service. This ensures complete control over:
1. **User Records**: Stored in `public.app_users` with bcrypt passwords (`pgcrypto`), custom 6-digit verification codes, and reset tokens.
2. **Session Records**: Stored in `public.app_sessions` with 32-byte secure session tokens.
3. **No GoTrue Dependency**: Does not require `supabase.auth.signInWithPassword()` or Supabase Auth triggers. All operations are standard PostgreSQL RPC procedures accessible via PostgREST REST APIs or `supabase.rpc()`.

---

## 2. Quick Flutter Setup

Add dependencies to `pubspec.yaml`:

```yaml
dependencies:
  flutter:
    sdk: flutter
  http: ^1.2.0
  flutter_secure_storage: ^9.2.2
  supabase_flutter: ^2.8.0 # Optional: you can use either supabase.rpc() or raw http
```

### Configuration Constant in Flutter
```dart
class AppConfig {
  static const String supabaseUrl = 'https://hbimbzwcdmhnxxdbbugw.supabase.co';
  static const String anonKey =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhiaW1iendjZG1obnh4ZGJidWd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE3MTExMzMsImV4cCI6MjEwNzI4NzEzM30.DzpkFReW44YAjKrMl1EOYt3LipcCf6Ec-NfdxIdlaJQ';

  static Map<String, String> get defaultHeaders => {
    'apikey': anonKey,
    'Content-Type': 'application/json',
  };
}
```

---

## 3. Endpoints & RPC Functions Reference

All custom auth functions are standard PostgREST RPC endpoints called via `POST /rest/v1/rpc/<function_name>`.

| Action | HTTP Endpoint | Stored Procedure |
| :--- | :--- | :--- |
| **Sign Up** | `POST /rest/v1/rpc/custom_signup` | `public.custom_signup` |
| **Sign In / Login** | `POST /rest/v1/rpc/custom_login` | `public.custom_login` |
| **Verify 6-Digit Code** | `POST /rest/v1/rpc/custom_verify_email` | `public.custom_verify_email` |
| **Resend Code** | `POST /rest/v1/rpc/custom_resend_verification` | `public.custom_resend_verification` |
| **Forgot Password Request** | `POST /rest/v1/rpc/custom_request_password_reset` | `public.custom_request_password_reset` |
| **Confirm Password Reset** | `POST /rest/v1/rpc/custom_reset_password` | `public.custom_reset_password` |
| **Validate Session Token** | `POST /rest/v1/rpc/custom_get_current_user` | `public.custom_get_current_user` |
| **Log Out** | `POST /rest/v1/rpc/custom_logout` | `public.custom_logout` |

---

## 4. Detailed API Specifications

### A. Custom Sign Up (`custom_signup`)
- **Endpoint**: `POST https://hbimbzwcdmhnxxdbbugw.supabase.co/rest/v1/rpc/custom_signup`
- **Headers**:
  ```http
  apikey: <anonKey>
  Content-Type: application/json
  ```
- **Body**:
  ```json
  {
    "p_email": "ouder@voorbeeld.nl",
    "p_password": "SecurePassword123!",
    "p_name": "Sanne de Vries",
    "p_usage_mode": "together"
  }
  ```
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Account created successfully. Verification code generated.",
    "user": {
      "id": "e6740c0c-8061-4fa3-a00e-4340dbdb43fa",
      "email": "ouder@voorbeeld.nl",
      "name": "Sanne de Vries",
      "usage_mode": "together",
      "is_verified": false
    },
    "verification_code": "489201",
    "session": {
      "token": "7a35e98f01b2c45d...",
      "expires_at": "2026-11-14T15:00:00Z"
    }
  }
  ```

---

### B. Custom Login (`custom_login`)
- **Endpoint**: `POST https://hbimbzwcdmhnxxdbbugw.supabase.co/rest/v1/rpc/custom_login`
- **Headers**:
  ```http
  apikey: <anonKey>
  Content-Type: application/json
  ```
- **Body**:
  ```json
  {
    "p_email": "ouder@voorbeeld.nl",
    "p_password": "SecurePassword123!"
  }
  ```
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "user": {
      "id": "e6740c0c-8061-4fa3-a00e-4340dbdb43fa",
      "email": "ouder@voorbeeld.nl",
      "name": "Sanne de Vries",
      "usage_mode": "together",
      "is_verified": true
    },
    "profile": {
      "id": "e6740c0c-8061-4fa3-a00e-4340dbdb43fa",
      "name": "Sanne de Vries",
      "full_name": "Sanne de Vries",
      "usage_mode": "together",
      "avatar_url": null,
      "onboarding_completed": false
    },
    "session": {
      "token": "e5b8d80c05fe43...",
      "expires_at": "2026-11-14T15:00:00Z"
    }
  }
  ```
- **Error Response (200 OK with success=false or 401)**:
  ```json
  {
    "success": false,
    "error": "Invalid email or password."
  }
  ```

---

### C. Verify 6-Digit Email Code (`custom_verify_email`)
- **Endpoint**: `POST https://hbimbzwcdmhnxxdbbugw.supabase.co/rest/v1/rpc/custom_verify_email`
- **Body**:
  ```json
  {
    "p_email": "ouder@voorbeeld.nl",
    "p_code": "489201"
  }
  ```
- **Success Response**:
  ```json
  {
    "success": true,
    "message": "Email verified successfully."
  }
  ```

---

### D. Resend Verification Code (`custom_resend_verification`)
- **Endpoint**: `POST https://hbimbzwcdmhnxxdbbugw.supabase.co/rest/v1/rpc/custom_resend_verification`
- **Body**:
  ```json
  {
    "p_email": "ouder@voorbeeld.nl"
  }
  ```
- **Success Response**:
  ```json
  {
    "success": true,
    "verification_code": "910284",
    "message": "Verification code resent."
  }
  ```

---

### E. Request Password Reset Code (`custom_request_password_reset`)
- **Endpoint**: `POST https://hbimbzwcdmhnxxdbbugw.supabase.co/rest/v1/rpc/custom_request_password_reset`
- **Body**:
  ```json
  {
    "p_email": "ouder@voorbeeld.nl"
  }
  ```
- **Success Response**:
  ```json
  {
    "success": true,
    "reset_code": "304912",
    "message": "If an account exists, a reset code has been sent."
  }
  ```

---

### F. Submit New Password (`custom_reset_password`)
- **Endpoint**: `POST https://hbimbzwcdmhnxxdbbugw.supabase.co/rest/v1/rpc/custom_reset_password`
- **Body**:
  ```json
  {
    "p_email": "ouder@voorbeeld.nl",
    "p_token": "304912",
    "p_new_password": "MyNewPassword2026!"
  }
  ```
- **Success Response**:
  ```json
  {
    "success": true,
    "message": "Password has been updated successfully."
  }
  ```

---

### G. Validate Session Token (`custom_get_current_user`)
- **Endpoint**: `POST https://hbimbzwcdmhnxxdbbugw.supabase.co/rest/v1/rpc/custom_get_current_user`
- **Body**:
  ```json
  {
    "p_token": "e5b8d80c05fe43..."
  }
  ```
- **Success Response**:
  ```json
  {
    "success": true,
    "user": { ... },
    "profile": { ... },
    "session": { "token": "...", "expires_at": "..." }
  }
  ```

---

### H. Custom Logout (`custom_logout`)
- **Endpoint**: `POST https://hbimbzwcdmhnxxdbbugw.supabase.co/rest/v1/rpc/custom_logout`
- **Body**:
  ```json
  {
    "p_token": "e5b8d80c05fe43..."
  }
  ```

---

## 5. Complete Flutter Authentication Service Implementation

Here is a ready-to-copy `AuthService` class in Dart using `http` and `flutter_secure_storage`:

```dart
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class CustomAuthService {
  static const String baseUrl = 'https://hbimbzwcdmhnxxdbbugw.supabase.co/rest/v1/rpc';
  static const String anonKey =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhiaW1iendjZG1obnh4ZGJidWd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE3MTExMzMsImV4cCI6MjEwNzI4NzEzM30.DzpkFReW44YAjKrMl1EOYt3LipcCf6Ec-NfdxIdlaJQ';

  final _storage = const FlutterSecureStorage();

  Map<String, String> get _headers => {
    'apikey': anonKey,
    'Content-Type': 'application/json',
  };

  /// 1. Sign Up
  Future<Map<String, dynamic>> signUp({
    required String email,
    required String password,
    required String name,
    String usageMode = 'together',
  }) async {
    final response = await http.post(
      Uri.parse('$baseUrl/custom_signup'),
      headers: _headers,
      body: jsonEncode({
        'p_email': email.trim().toLowerCase(),
        'p_password': password,
        'p_name': name.trim(),
        'p_usage_mode': usageMode,
      }),
    );

    final data = jsonDecode(response.body);
    if (data['success'] != true) {
      throw Exception(data['error'] ?? 'Sign up failed');
    }

    if (data['session']?['token'] != null) {
      await _storage.write(key: 'session_token', value: data['session']['token']);
    }

    return data;
  }

  /// 2. Sign In (Login)
  Future<Map<String, dynamic>> login({
    required String email,
    required String password,
  }) async {
    final response = await http.post(
      Uri.parse('$baseUrl/custom_login'),
      headers: _headers,
      body: jsonEncode({
        'p_email': email.trim().toLowerCase(),
        'p_password': password,
      }),
    );

    final data = jsonDecode(response.body);
    if (data['success'] != true) {
      throw Exception(data['error'] ?? 'Invalid login credentials');
    }

    await _storage.write(key: 'session_token', value: data['session']['token']);
    return data;
  }

  /// 3. Verify 6-digit email code
  Future<bool> verifyEmail({
    required String email,
    required String code,
  }) async {
    final response = await http.post(
      Uri.parse('$baseUrl/custom_verify_email'),
      headers: _headers,
      body: jsonEncode({
        'p_email': email.trim().toLowerCase(),
        'p_code': code.trim(),
      }),
    );

    final data = jsonDecode(response.body);
    if (data['success'] != true) {
      throw Exception(data['error'] ?? 'Invalid verification code');
    }
    return true;
  }

  /// 4. Resend code
  Future<String?> resendCode({required String email}) async {
    final response = await http.post(
      Uri.parse('$baseUrl/custom_resend_verification'),
      headers: _headers,
      body: jsonEncode({
        'p_email': email.trim().toLowerCase(),
      }),
    );

    final data = jsonDecode(response.body);
    return data['verification_code'];
  }

  /// 5. Request Password Reset
  Future<String?> requestPasswordReset({required String email}) async {
    final response = await http.post(
      Uri.parse('$baseUrl/custom_request_password_reset'),
      headers: _headers,
      body: jsonEncode({
        'p_email': email.trim().toLowerCase(),
      }),
    );

    final data = jsonDecode(response.body);
    return data['reset_code'];
  }

  /// 6. Confirm Password Reset
  Future<bool> confirmPasswordReset({
    required String email,
    required String code,
    required String newPassword,
  }) async {
    final response = await http.post(
      Uri.parse('$baseUrl/custom_reset_password'),
      headers: _headers,
      body: jsonEncode({
        'p_email': email.trim().toLowerCase(),
        'p_token': code.trim(),
        'p_new_password': newPassword,
      }),
    );

    final data = jsonDecode(response.body);
    if (data['success'] != true) {
      throw Exception(data['error'] ?? 'Reset failed');
    }
    return true;
  }

  /// 7. Logout
  Future<void> logout() async {
    final token = await _storage.read(key: 'session_token');
    if (token != null) {
      await http.post(
        Uri.parse('$baseUrl/custom_logout'),
        headers: _headers,
        body: jsonEncode({'p_token': token}),
      );
    }
    await _storage.delete(key: 'session_token');
  }
}
```

---

## 6. Testing via Postman

Import [`docs/Ouderschap_Co_API.postman_collection.json`](./Ouderschap_Co_API.postman_collection.json) directly into Postman:
1. All custom auth & child requests are grouped under **Authentication (Custom Engine)** and **Child Profiles**.
2. The `{{baseUrl}}` and `{{anonKey}}` variables are pre-configured.
3. Tests run automatically and save the session token to the collection variable `{{sessionToken}}`.

---

## 7. Child Profiles & Independent Parent Management via Edge Function (`manage-children`)

A parent can register and use the application independently (`usage_mode = "solo"` or `"together"`).
Any parent can create and manage child profiles **without requiring the other parent to join**.

All child operations are managed through the serverless Edge Function:
- **Base Function URL**: `https://hbimbzwcdmhnxxdbbugw.supabase.co/functions/v1/manage-children`
- **Method**: `POST`
- **Headers**:
  ```http
  apikey: <anonKey>
  Content-Type: application/json
  ```

---

### A. Create Child Profile (`action: "create"`)
- **Body**:
  ```json
  {
    "action": "create",
    "parent_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "name": "Emma",
    "last_name": "de Vries",
    "date_of_birth": "2018-05-14",
    "school": "De Regenboog",
    "daycare": "BSO De Kleine Vlinder",
    "medical_notes": "Ventolin inhaler in school bag",
    "allergies": "Gluten, peanut",
    "clothes_size": "128",
    "shoe_size": "32",
    "color_code": "#3C6E71"
  }
  ```
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "child": {
      "id": "c1f7b8a0-4f5b-4c9d-8e6f-7a1b2c3d4e5f",
      "name": "Emma",
      "last_name": "de Vries",
      "date_of_birth": "2018-05-14",
      "school": "De Regenboog",
      "medical_notes": "Ventolin inhaler in school bag",
      "allergies": "Gluten, peanut",
      "clothes_size": "128",
      "shoe_size": "32",
      "color_code": "#3C6E71",
      "created_by": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
      "created_at": "2026-10-16T12:45:00Z"
    }
  }
  ```

### B. Fetch All Children For Parent (`custom_get_my_children`)
- **Endpoint**: `POST https://hbimbzwcdmhnxxdbbugw.supabase.co/rest/v1/rpc/custom_get_my_children`
- **Body**:
  ```json
  {
    "p_parent_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d"
  }
  ```
- **Success Response (200 OK)**:
  ```json
  {
    "success": true,
    "children": [
      {
        "id": "c1f7b8a0-4f5b-4c9d-8e6f-7a1b2c3d4e5f",
        "name": "Emma",
        "last_name": "de Vries",
        "date_of_birth": "2018-05-14",
        "school": "De Regenboog",
        "allergies": "Gluten, peanut",
        "can_edit": true,
        "role": "parent"
      }
    ]
  }
  ```

### C. Update Child (`custom_update_child`)
- **Endpoint**: `POST https://hbimbzwcdmhnxxdbbugw.supabase.co/rest/v1/rpc/custom_update_child`
- **Body**:
  ```json
  {
    "p_child_id": "c1f7b8a0-4f5b-4c9d-8e6f-7a1b2c3d4e5f",
    "p_parent_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "p_school": "Nieuwe Basisschool",
    "p_clothes_size": "134"
  }
  ```

### D. Delete Child (`custom_delete_child`)
- **Endpoint**: `POST https://hbimbzwcdmhnxxdbbugw.supabase.co/rest/v1/rpc/custom_delete_child`
- **Body**:
  ```json
  {
    "p_child_id": "c1f7b8a0-4f5b-4c9d-8e6f-7a1b2c3d4e5f",
    "p_parent_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d"
  }
  ```

### E. Flutter Child Service Implementation (Edge Function)
```dart
class ChildService {
  final String edgeUrl = '${AppConfig.supabaseUrl}/functions/v1/manage-children';
  final Map<String, String> _headers = AppConfig.defaultHeaders;

  /// Fetch all children belonging to this parent via Edge Function
  Future<List<Map<String, dynamic>>> getMyChildren(String parentId) async {
    final res = await http.post(
      Uri.parse(edgeUrl),
      headers: _headers,
      body: jsonEncode({
        'action': 'list',
        'parent_id': parentId,
      }),
    );
    final data = jsonDecode(res.body);
    if (data['success'] == true) {
      return List<Map<String, dynamic>>.from(data['children']);
    }
    return [];
  }

  /// Create child independently via Edge Function
  Future<Map<String, dynamic>> createChild({
    required String parentId,
    required String name,
    String? lastName,
    String? dateOfBirth,
    String? school,
    String? daycare,
    String? medicalNotes,
    String? allergies,
    String? clothesSize,
    String? shoeSize,
    String colorCode = '#3C6E71',
  }) async {
    final res = await http.post(
      Uri.parse(edgeUrl),
      headers: _headers,
      body: jsonEncode({
        'action': 'create',
        'parent_id': parentId,
        'name': name,
        'last_name': lastName,
        'date_of_birth': dateOfBirth,
        'school': school,
        'daycare': daycare,
        'medical_notes': medicalNotes,
        'allergies': allergies,
        'clothes_size': clothesSize,
        'shoe_size': shoeSize,
        'color_code': colorCode,
      }),
    );
    final data = jsonDecode(res.body);
    if (data['success'] == true) {
      return data['child'];
    }
    throw Exception(data['error'] ?? 'Could not create child profile');
  }

  /// Update usage mode ('solo' or 'together') via Edge Function
  Future<bool> updateUsageMode({
    required String userId,
    required String usageMode, // 'solo' | 'together'
  }) async {
    final res = await http.post(
      Uri.parse(edgeUrl),
      headers: _headers,
      body: jsonEncode({
        'action': 'update_usage_mode',
        'user_id': userId,
        'usage_mode': usageMode,
      }),
    );
    final data = jsonDecode(res.body);
    return data['success'] == true;
  }
}
```

