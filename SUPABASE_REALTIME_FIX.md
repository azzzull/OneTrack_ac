# Supabase Realtime Fix - Production Issue Analysis

## Error Report

```
"Uncaught Error: cannot add `postgres_changes` callbacks for realtime:requests-stats after `subscribe()`"
"AuthSessionMissingError: Auth session missing!"
Result: Blank white screen
```

---

## Root Cause Analysis

### Issue #1: Fixed Channel Names Without User ID

**File:** `src/hooks/useRequestStats.jsx`

```javascript
// PROBLEM: "requests-stats" is a fixed name - causes collision when multiple users
channelRef.current = supabase.channel("requests-stats");
```

### Issue #2: Multiple Components Creating Same-Fixed Channels

| Component            | Channel Name                    | Status    |
| -------------------- | ------------------------------- | --------- |
| useRequestStats      | `requests-stats`                | ❌ Fixed  |
| sidebar              | `requests-new-notify`           | ✅ Fixed  |
| admin/Dashboard      | `admin-dashboard`               | ✅ Fixed  |
| admin/Requests       | `admin-requests-page`           | ✅ Fixed  |
| technician/Dashboard | `technician-dashboard-{userId}` | ✅ Unique |

### Issue #3: Using `.unsubscribe()` Instead of `supabase.removeChannel()`

**Problem:** `.unsubscribe()` only stops receiving events but the channel remains in Supabase's internal state. When you try to subscribe again with the same name, you get the error.

### Issue #4: No Cleanup Before Creating New Channels

Before creating any channel, the code should:

1. Check if channel already exists with same name
2. Remove ALL existing channels first
3. Then create new channel

### Issue #5: Race Condition with Auth

Subscriptions are set up in `useEffect` with dependencies like `[loading, user]`, but:

- Auth session might not be fully restored when component mounts
- Multiple re-renders can trigger channel creation multiple times
- No "auth ready" guard

---

## Why It Works Locally But Fails on VPS

| Factor              | Local Dev                  | Production VPS        |
| ------------------- | -------------------------- | --------------------- |
| React Strict Mode   | ✅ Yes (double invocation) | ❌ No                 |
| Page Refresh        | Frequent                   | Rare                  |
| Auth Session        | Fresh each load            | Restored from storage |
| Concurrent Features | Limited                    | Full                  |
| Memory Cleanup      | Auto                       | Manual required       |

---

## Dangerous Patterns Found

1. ❌ `channel("requests-stats")` - no user ID
2. ❌ `channel("admin-dashboard")` - no user ID
3. ❌ `channel("requests-new-notify")` - no user ID
4. ❌ Using `channelRef.current.unsubscribe()` without `supabase.removeChannel()`
5. ❌ No guard checking existing channels before subscribe

---

## Fix Plan

### Step 1: Create Global Channel Manager

- Singleton pattern to track ALL channels
- Unique channel names with user ID suffix
- Proper cleanup using `supabase.removeChannel()`

### Step 2: Refactor useRequestStats.jsx

- Add user ID to channel name
- Use global channel manager
- Proper async cleanup

### Step 3: Refactor All Dashboard Components

- Add user ID to all channel names
- Cleanup existing channels before subscribing

### Step 4: Fix AuthContext

- Wait for auth session to be fully ready before allowing subscriptions
- Add `isAuthenticated` flag

---

## Implementation Notes

- DO NOT use `.unsubscribe()` - always use `supabase.removeChannel()`
- DO use unique channel names: `{channelName}-{userId}`
- DO cleanup before creating: `supabase.getChannels().forEach(ch => supabase.removeChannel(ch))`
- DO wait for auth: `if (loading || !user) return`
