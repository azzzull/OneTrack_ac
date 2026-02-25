-- Fix script for profiles.name NULL constraint violation
-- Run this in your Supabase SQL Editor

-- 1. First, make sure the name column exists and can accept NULLs temporarily
alter table public.profiles
add column if not exists name text;

-- 2. Update all NULL name values with computed names from first_name + last_name
update public.profiles
set name = case 
    when trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')) != '' then
        trim(coalesce(first_name, '') || ' ' || coalesce(last_name, ''))
    else
        coalesce(email, 'User')
end
where name is null;

-- 3. Now add NOT NULL constraint to name column if it doesn't have one
-- First check via information_schema if needed
-- Then apply: alter table public.profiles alter column name set not null;

-- 4. Verify the fix
select id, name, first_name, last_name, email, role 
from public.profiles 
where name is null 
limit 10;

-- 5. If all names are populated, uncomment to add NOT NULL constraint:
-- alter table public.profiles alter column name set not null;
