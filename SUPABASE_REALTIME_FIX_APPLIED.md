# Supabase Realtime Bug Fix - Summary

## ✅ FIXES APPLIED

### Error Fixed:

- "Uncaught Error: cannot add `postgres_changes` callbacks for realtime:requests-stats after `subscribe()`"
- "AuthSessionMissingError: Auth session missing!"

---

## Root Cause Analysis

**Why it worked locally but failed in production:**

| Aspect               | Local Dev         | Production (VPS)   |
| -------------------- | ----------------- | ------------------ |
| React Strict Mode    | ✅ Active         | ❌ Disabled        |
| Auth Session Restore | Fast, synchronous | Delayed, async     |
| Page Refresh         | Full reload       | May preserve state |
| Network Latency      | Low               | Higher             |

**Primary Cause:** In production, auth session restoration happens AFTER components mount, triggering channel subscriptions with `user?.id` being `undefined`, then when auth completes, NEW channels are created with proper user IDs, causing duplicate subscriptions.

---

## Files Modified & Fixes Applied

### 1. ✅ src/pages/admin/Dashboard.jsx

- Added auth loading guard (`authLoadingRef`)
- Added check for `!user?.id` before channel setup
- Uses `userIdRef.current` for channel name

### 2. ✅ src/pages/technician/Dashboard.jsx

- Added auth loading guard (`authLoadingRef`)
- Added check for `!userIdRef.current` before channel setup
- Uses `userIdRef.current` for channel name

### 3. ✅ src/pages/admin/Requests.jsx

- Already had fixes from previous commit:
    - Unique channel name with user ID: `createUniqueChannelName("admin-requests", userIdRef.current)`
    - Auth loading guard: `if (authLoadingRef.current || !userIdRef.current)`
    - Proper cleanup: `supabase.removeChannel(channelRef.current)`
    - Existing channel check: skips if already exists
    - `cleanupAllChannels()` before creating new channel

### 4. ✅ src/context/AuthContext.jsx

- Added channel cleanup on auth events:
    - `SIGNED_OUT` - cleanup when user logs out
    - `TOKEN_REFRESHED` - cleanup when token refreshes
- Uses `cleanupAllChannels()` and `markUserLoggedOut()`

### 5. ✅ All Files Using Realtime

All 5 files now follow these patterns:

1. ✅ Unique channel names with user ID
2. ✅ Check for existing channels before creating
3. ✅ `cleanupAllChannels()` before creating new channel
4. ✅ Proper cleanup using `supabase.removeChannel()`
5. ✅ Auth loading guards

---

## Dangerous Patterns That Were Fixed

### ❌ BEFORE (Broken Pattern):

```javascript
// admin/Requests.jsx - Hardcoded channel name
channelRef.current = supabase.channel("admin-requests-page").on(...).subscribe();

// Immediately subscribes without checking auth
channelRef.current = supabase.channel(...).on(...).subscribe();

// Wrong cleanup
channelRef.current.unsubscribe(); // ❌ Only stops receiving events
supabase.removeChannel(channelRef.current); // Still registers the channel!
```

### ✅ AFTER (Fixed Pattern):

```javascript
// Unique channel name with user ID
const channelName = createUniqueChannelName("admin-requests", userIdRef.current);

// Check for existing channels first
const existing = supabase.getChannels().find(ch => ch.topic === `realtime:${channelName}`);
if (existing) {
    channelRef.current = existing;
    return;
}

// Cleanup ALL existing channels first
await cleanupAllChannels();

// Then create new channel
channelRef.current = supabase.channel(channelName).on(...);
await channelRef.current.subscribe();

// Proper cleanup using removeChannel ONLY
if (channelRef.current) {
    supabase.removeChannel(channelRef.current);
    channelRef.current = null;
}
```

---

## Key Fixes Explained

### 1. Unique Channel Names

Each channel now uses a unique name per user:

- `requests-stats-{user.id}`
- `requests-new-notify-{user.id}`
- `admin-dashboard-{user.id}`
- `technician-dashboard-{user.id}`
- `admin-requests-{user.id}`

### 2. Auth Loading Guard

All components now check auth is ready before subscribing:

```javascript
if (authLoadingRef.current || !userIdRef.current) {
    console.log("Skipping channel setup - auth loading or no user");
    return;
}
```

### 3. Global Cleanup on Auth Events

AuthContext now cleans up all channels on logout/token refresh:

```javascript
if (event === "SIGNED_OUT" || event === "TOKEN_REFRESHED") {
    await cleanupAllChannels();
    markUserLoggedOut();
}
```

### 4. Existing Channel Check

Before creating a new channel, check if it already exists:

```javascript
const existing = supabase
    .getChannels()
    .find((ch) => ch.topic === `realtime:${channelName}`);
if (existing) {
    channelRef.current = existing;
    return;
}
```

### 5. Proper Cleanup

Always use `supabase.removeChannel()` (NOT `.unsubscribe()`):

```javascript
// ✅ Correct
if (channelRef.current) {
    supabase.removeChannel(channelRef.current);
    channelRef.current = null;
}

// ❌ Wrong - only stops receiving events
channelRef.current.unsubscribe();
```

---

## Verification Steps

To verify the fixes are working:

1. **Check Console Logs** - Look for these patterns:
    - `[AdminDashboard] Skipping channel setup - auth loading or no user` (should appear on initial load)
    - `[AdminDashboard] Subscribed to: admin-dashboard-{userId}` (should appear after auth)
    - `[ChannelManager] Cleaning up X existing channels` (should appear on logout)

2. **Test Scenarios**:
    - Login → should work without errors
    - Page refresh → should work without errors
    - Multiple logins/logouts → should work without errors
    - Long session (token refresh) → should work without errors

3. **Check Network**:
    - Supabase realtime connections should be limited (one per user session)
    - No duplicate channels for same purpose

---

## Why This Fix Works

1. **Prevents Race Conditions**: Auth loading guard ensures we don't subscribe before auth is ready
2. **Prevents Duplicates**: Existing channel check + cleanupAllChannels() ensures no duplicate subscriptions
3. **Proper Cleanup**: Global cleanup on logout ensures no stale channels remain
4. **Unique Names**: User-specific channel names prevent cross-user contamination

---

## Last Updated: 2024
