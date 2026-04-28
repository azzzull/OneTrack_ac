-- Sync customer profile changes into master_customers and existing requests
-- Run this once in Supabase SQL Editor

create or replace function public.sync_customer_from_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    next_display_name text;
    prev_display_name text;
begin
    next_display_name := trim(
        concat_ws(' ', coalesce(new.first_name, ''), coalesce(new.last_name, ''))
    );
    if next_display_name = '' then
        next_display_name := coalesce(new.email, old.email, '');
    end if;

    prev_display_name := trim(
        concat_ws(' ', coalesce(old.first_name, ''), coalesce(old.last_name, ''))
    );
    if prev_display_name = '' then
        prev_display_name := coalesce(old.email, new.email, '');
    end if;

    update public.master_customers
    set
        user_id = coalesce(user_id, new.id),
        name = next_display_name,
        email = coalesce(new.email, email),
        phone = coalesce(nullif(new.phone, ''), phone)
    where user_id = new.id
       or (
            old.email is not null
            and old.email <> ''
            and lower(email) = lower(old.email)
       )
       or (
            new.email is not null
            and new.email <> ''
            and lower(email) = lower(new.email)
       );

    update public.master_projects mp
    set
        pic_name = case
            when mp.pic_name is null
              or mp.pic_name = ''
              or mp.pic_name = prev_display_name
            then next_display_name
            else mp.pic_name
        end,
        phone = coalesce(nullif(new.phone, ''), mp.phone)
    from public.master_customers c
    where mp.customer_id = c.id
      and (
            c.user_id = new.id
            or (
                new.email is not null
                and new.email <> ''
                and c.email is not null
                and lower(c.email) = lower(new.email)
            )
          );

    return new;
end;
$$;

drop trigger if exists on_profile_synced_to_customer on public.profiles;
create trigger on_profile_synced_to_customer
after update of first_name, last_name, email, phone on public.profiles
for each row execute function public.sync_customer_from_profile();

create or replace function public.sync_requests_from_customer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    update public.requests r
    set
        customer_name = coalesce(nullif(new.name, ''), r.customer_name),
        customer_phone = coalesce(nullif(new.phone, ''), r.customer_phone),
        address = coalesce(nullif(new.address, ''), r.address),
        location = coalesce(nullif(new.location, ''), r.location)
    where r.customer_id = new.id;

    return new;
end;
$$;

drop trigger if exists on_customer_synced_to_requests on public.master_customers;
create trigger on_customer_synced_to_requests
after update of name, phone, address, location on public.master_customers
for each row execute function public.sync_requests_from_customer();

create or replace function public.sync_requests_from_project()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    update public.requests r
    set
        title = coalesce(nullif(new.project_name, ''), r.title),
        customer_phone = coalesce(nullif(new.phone, ''), r.customer_phone),
        address = coalesce(nullif(new.address, ''), r.address),
        location = coalesce(nullif(new.location, ''), r.location)
    where r.project_id = new.id;

    return new;
end;
$$;

drop trigger if exists on_project_synced_to_requests on public.master_projects;
create trigger on_project_synced_to_requests
after update of project_name, phone, address, location on public.master_projects
for each row execute function public.sync_requests_from_project();

-- Optional backfill for existing rows right now
update public.requests r
set
    customer_name = coalesce(nullif(c.name, ''), r.customer_name),
    customer_phone = coalesce(nullif(c.phone, ''), r.customer_phone),
    address = coalesce(
        (
            select nullif(mp.address, '')
            from public.master_projects mp
            where mp.id = r.project_id
        ),
        nullif(c.address, ''),
        r.address
    ),
    location = coalesce(
        (
            select nullif(mp.location, '')
            from public.master_projects mp
            where mp.id = r.project_id
        ),
        nullif(c.location, ''),
        r.location
    ),
    title = coalesce(
        (
            select nullif(mp.project_name, '')
            from public.master_projects mp
            where mp.id = r.project_id
        ),
        r.title
    )
from public.master_customers c
where r.customer_id = c.id;
