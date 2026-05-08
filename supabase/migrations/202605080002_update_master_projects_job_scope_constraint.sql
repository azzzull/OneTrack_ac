-- Migration: Update master_projects job_scope to reference master_job_scopes
-- This fixes the issue where new job scopes cannot be used in projects

-- First, drop the old check constraint
ALTER TABLE public.master_projects
DROP CONSTRAINT IF EXISTS master_projects_job_scope_check;

-- Add foreign key constraint to master_job_scopes(code)
-- This ensures job_scope must exist in master_job_scopes
ALTER TABLE public.master_projects
ADD CONSTRAINT master_projects_job_scope_fkey
FOREIGN KEY (job_scope) REFERENCES public.master_job_scopes(code)
ON DELETE RESTRICT ON UPDATE CASCADE;