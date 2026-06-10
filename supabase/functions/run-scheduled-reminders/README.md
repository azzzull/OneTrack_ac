# run-scheduled-reminders

Server-side scheduled reminder runner for OneTrack.

This function scans operational data, applies reminder cooldowns from
`public.notification_reminders`, and sends eligible reminders through the
existing `send-push-notification` Edge Function. It does not send FCM directly.

## Required Secret

Use the same value for both functions:

```bash
supabase secrets set SCHEDULED_REMINDER_SECRET="replace-with-long-random-secret"
```

`run-scheduled-reminders` sends this secret in
`x-scheduled-reminder-secret`. `send-push-notification` accepts that internal
call only when the request is also authorized with `SUPABASE_SERVICE_ROLE_KEY`.

## Deploy

```bash
supabase db push
supabase functions deploy send-push-notification
supabase functions deploy run-scheduled-reminders
```

`send-push-notification` uses its own in-function authorization, so the
Supabase gateway JWT check must be disabled for that function. This repo sets:

```toml
[functions.send-push-notification]
verify_jwt = false
```

If your CLI does not pick up `supabase/config.toml`, deploy it with:

```bash
supabase functions deploy send-push-notification --no-verify-jwt
```

## Manual Dry Run

Dry run returns candidates and resolved recipients, but does not create
notifications, send push, or update `notification_reminders`.

```bash
supabase functions invoke run-scheduled-reminders --body '{"dryRun":true}'
```

To test attendance outside 07:30-08:00 Asia/Jakarta:

```bash
supabase functions invoke run-scheduled-reminders --body '{"dryRun":true,"includeAttendance":true}'
```

## Manual Real Run

```bash
supabase functions invoke run-scheduled-reminders --body '{}'
```

## Cron

In Supabase Scheduled Functions, create:

```text
*/30 * * * *  run-scheduled-reminders
```

The function checks attendance reminders only during 07:30-07:59
Asia/Jakarta, so the same 30-minute schedule covers the operational reminders
and the 07:30 attendance pass.

If your Supabase project supports multiple schedules for the same function,
add this optional tighter attendance schedule:

```text
30-59 7 * * *  run-scheduled-reminders
```

## Reminder Adaptation

- Available jobs are `requests.status in ('pending', 'requested',
  'open_for_technician')` with `technician_id is null`.
- No-progress jobs use `requests.updated_at` as the latest progress marker.
- Accommodation transfer is represented by `accommodation_requests.status =
  'approved'` with `reviewed_at`.
- Realization review is tracked by the new
  `accommodation_realizations.review_status` column, defaulting to
  `pending_review`.
- Attendance uses the existing `attendance` table and Jakarta local date.
