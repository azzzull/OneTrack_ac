# Supabase Realtime Bug Analysis & Fix

## Error Messages:

1. "Uncaught Error: cannot add `postgres_changes` callbacks for realtime:requests-stats after `subscribe()`"
2. "AuthSessionMissingError: Auth session missing!"

---

## Root Cause Analysis

### Why It Works Locally But Fails In Production:

| Aspect               | Local Dev                | Production (VPS)   |
| -------------------- | ------------------------ | ------------------ |
| React Strict Mode    | ✅ Active (double mount) | ❌ Disabled        |
| Auth Session Restore | Fast, synchronous        | Delayed, async     |
| Page Refresh         | Full reload              | May preserve state |
| Network Latency      | Low                      | Higher             |

**Primary Cause:** In production, the auth session restoration happens AFTER components mount, triggering channel subscriptions with `user?.id` being `undefined`, then when auth completes, NEW channels are created with proper user IDs, causing duplicate subscriptions.

---

## Dangerous Patterns Found

### 🔴 CRITICAL - src/pages/admin/Requests.jsx:

**Problem 1: Hardcoded channel name (not user-specific)**

```javascript
channelRef.current = supabase
    .channel("admin-requests-page")  // ❌ Hardcoded - no user ID!
    .on(...)
```

**Problem 2: Immediate subscribe without lifecycle**

```javascript
// This runs .subscribe() immediately in component body
// without proper useEffect cleanup protection
channelRef.current = supabase
    .channel(...)
    .on(...).on(...).on(...)
    .subscribe();  // ❌ Immediate - no guard!
```

**Problem 3: Wrong cleanup method**

```javascript
return () => {
    if (channelRef.current) {
        channelRef.current.unsubscribe(); // ❌ Wrong! Should use removeChannel()
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
    }
};
```

**Problem 4: Empty dependency array with external refs**

```javascript
useEffect(() => {
    // Uses roleRef.current and userIdRef.current
    // but has [] dependency - race condition!
}, []); // ❌ Empty but uses external refs
```

---

### 🟡 MEDIUM - Admin/Technician Dashboards:

**Problem: Channel setup with potentially undefined user ID**

```javascript
const channelName = createUniqueChannelName(
    "admin-dashboard",
    user?.id, // Can be undefined initially!
);

// Also: starts setup even without checking loading state
if (user?.id) {
    setupChannel(); // May run after but before auth completes
}
```

---

## All Channel Usages Found:

| File                     | Channel Name                     | Uses Unique ID? | Has Cleanup? | Status                |
| ------------------------ | -------------------------------- | --------------- | ------------ | --------------------- |
| useRequestStats.jsx      | `requests-stats-{user.id}`       | ✅ Yes          | ✅ Yes       | ⚠️ Needs improvements |
| sidebar.jsx              | `requests-new-notify-{user.id}`  | ✅ Yes          | ✅ Yes       | ✅ Good               |
| admin/Dashboard.jsx      | `admin-dashboard-{user?.id}`     | ⚠️ Partial      | ✅ Yes       | 🟡 Needs fix          |
| technician/Dashboard.jsx | `technician-dashboard-{user.id}` | ⚠️ Partial      | ✅ Yes       | 🟡 Needs fix          |
| admin/Requests.jsx       | `admin-requests-page`            | ❌ NO           | ❌ Wrong     | 🔴 CRITICAL           |
| customer/Dashboard.jsx   | (via useCustomerRequests)        | ✅ Yes          | ⚠️ Partial   | 🟡 Needs fix          |

---

## Fix Plan

### Step 1: Fix admin/Requests.jsx (CRITICAL)

- Make channel name user-specific
- Add proper lifecycle management
- Fix cleanup to use ONLY removeChannel()
- Add loading guard before creating channels
- Check for existing channels before creating

### Step 2: Fix Dashboards (MEDIUM)

- Add loading state guard
- Use proper user ID with fallback
- Ensure cleanup handles all cases

### Step 3: Fix useCustomerRequests (MEDIUM)

- Make cleanup consistent with others
- Add check for existing channels

### Step 4: Auth Fix

- Add global auth state listener
- Prevent subscription before auth ready
- Cleanup channels on logout

---

## Implementation Notes:

1. **DO NOT USE** `.unsubscribe()` - it only stops receiving events but keeps the channel registered
2. **ALWAYS USE** `supabase.removeChannel()` to properly remove channels
3. **ALWAYS** call `cleanupAllChannels()` before creating new channels
4. **ALWAYS** use unique channel names with user ID
5. **ALWAYS** guard against loading/auth state before subscribing
