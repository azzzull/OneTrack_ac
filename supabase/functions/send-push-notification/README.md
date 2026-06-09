# send-push-notification

Supabase Edge Function untuk mengirim Firebase Cloud Messaging push notification ke user OneTrack berdasarkan user ID atau role.

Phase ini hanya menyiapkan sender push notification. Integrasi otomatis dari event pekerjaan, akomodasi, atau absensi belum dibuat.

## Secrets

Set Firebase service account secrets di Supabase:

```bash
supabase secrets set FIREBASE_PROJECT_ID="your-firebase-project-id"
supabase secrets set FIREBASE_CLIENT_EMAIL="firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com"
supabase secrets set FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

`FIREBASE_PRIVATE_KEY` harus menyimpan newline dengan benar. Jika copy dari JSON service account, format `\n` tetap bisa dipakai karena function akan mengubahnya menjadi newline asli.

Function juga membutuhkan env bawaan Supabase:

```bash
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

## Deploy

```bash
supabase functions deploy send-push-notification
```

## Manual Test

Panggil function dari app saat user sudah login:

```ts
await supabase.functions.invoke("send-push-notification", {
  body: {
    recipientUserIds: ["CURRENT_USER_ID_FOR_TESTING"],
    title: "Test Push OneTrack",
    body: "Notifikasi test dari Supabase Edge Function berhasil.",
    type: "test_push",
    referenceTable: "test",
    referenceId: null,
    data: {
      source: "phase_2b"
    }
  }
});
```

Expected result:

- Row baru masuk ke `public.notifications`.
- Android device menerima push notification jika token tersedia.
- Response JSON menampilkan `sentCount > 0`.

## Security

- Function hanya menerima request authenticated.
- User biasa hanya boleh mengirim push ke dirinya sendiri.
- Pengiriman ke `recipientRoles` atau user lain hanya boleh dilakukan oleh role `admin` atau `management`.
- Firebase credentials tidak dipakai di frontend.
