# Supabase Edge Functions (Admin User Management)

Function yang dipakai front-end:
- `admin-create-user`
- `admin-update-user-password`
- `admin-delete-user`

Lokasi source:
- `supabase/functions/admin-create-user/index.ts`
- `supabase/functions/admin-update-user-password/index.ts`
- `supabase/functions/admin-delete-user/index.ts`

## Deploy

Jalankan dari root project:

```bash
supabase login
supabase link --project-ref <PROJECT_REF>
supabase functions deploy admin-create-user
supabase functions deploy admin-update-user-password
supabase functions deploy admin-delete-user
```

## Catatan

- Kedua function butuh env bawaan Supabase Edge Runtime:
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
- Function akan validasi caller harus `admin`.
- `admin-delete-user` memblokir admin menghapus akun dirinya sendiri.
- Untuk update password akun sendiri, front-end memakai `supabase.auth.updateUser()` langsung.
