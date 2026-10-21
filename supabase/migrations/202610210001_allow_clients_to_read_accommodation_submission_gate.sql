-- The Accommodation form needs to read the same global switch as the
-- server-side trigger. The function returns only a boolean configuration
-- value, so authenticated users can safely use it to avoid a stale
-- client-side block before attempting a submission.
grant execute on function public.is_accommodation_submission_block_enabled()
    to authenticated;

notify pgrst, 'reload schema';
