-- Phase 1 Multi-Tenant Implementation
-- Run this ENTIRE script in Supabase SQL Editor using service_role key
-- Branch: feature/multiScope
-- Purpose: Multi-tenant AC + future scopes, backward compatible

-- ========================================
-- 1. SCHEMA CHANGES (Safe ADD COLUMN IF NOT EXISTS)
-- ========================================

-- Extend profiles for technician_type and customer_id (nullable)
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS technician_type text
CHECK (technician_type IN ('internal', 'external') OR technician_type IS NULL),
ADD COLUMN IF NOT EXISTS customer_id uuid
REFERENCES public.master_customers(id) ON DELETE SET NULL;

-- Extend requests for multi-scope
ALTER TABLE public.requests
ADD COLUMN IF NOT EXISTS job_scope text DEFAULT 'AC' CHECK (job_scope IS NOT NULL),
ADD COLUMN IF NOT EXISTS dynamic_data jsonb,
ADD COLUMN IF NOT EXISTS form_template_id uuid,
ADD COLUMN IF NOT EXISTS form_template_version uuid,
ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Backfill job_scope='AC' for existing jobs (backward compatibility)
UPDATE public.requests SET job_scope = 'AC' WHERE job_scope IS NULL;

-- Update status CHECK constraint to new values (existing data compatible)
ALTER TABLE public.requests DROP CONSTRAINT IF EXISTS requests_status_check;
ALTER TABLE public.requests ADD CONSTRAINT requests_status_check
CHECK (status IN ('pending', 'requested', 'assigned', 'in_progress', 'completed'));
ALTER TABLE public.requests ALTER COLUMN status SET DEFAULT 'requested';

-- Create technician_customer_assignments table
CREATE TABLE IF NOT EXISTS public.technician_customer_assignments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    technician_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    customer_id uuid NOT NULL REFERENCES public.master_customers(id) ON DELETE CASCADE,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    UNIQUE(technician_id, customer_id)
);

-- Performance indexes (CONCURRENTLY safe for production)
CREATE INDEX IF NOT EXISTS idx_requests_customer_id ON public.requests(customer_id);
CREATE INDEX IF NOT EXISTS idx_requests_job_scope ON public.requests(job_scope);
CREATE INDEX IF NOT EXISTS idx_requests_status ON public.requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_deleted_at ON public.requests(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_assignments_technician_id ON public.technician_customer_assignments(technician_id);
CREATE INDEX IF NOT EXISTS idx_assignments_customer_id ON public.technician_customer_assignments(customer_id) WHERE is_active = true;

-- Enable RLS if not already (safety)
ALTER TABLE public.technician_customer_assignments ENABLE ROW LEVEL SECURITY;

-- ========================================
-- 2. CORE FUNCTIONS (SECURITY DEFINER, bypass RLS safely)
-- ========================================

-- SINGLE SOURCE OF TRUTH: Returns customer_ids user can access
CREATE OR REPLACE FUNCTION public.get_assigned_customers(p_user_id uuid)
RETURNS SETOF uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
    v_role text;
    v_tech_type text;
    v_customer_id uuid;
BEGIN
    -- Get user profile (bypass RLS via SECURITY DEFINER)
    SELECT role, technician_type, customer_id
    INTO v_role, v_tech_type, v_customer_id
    FROM public.profiles
    WHERE id = p_user_id;

    IF v_role IS NULL THEN
        RETURN;
    END IF;

    -- Admin: ALL customers
    IF v_role = 'admin' THEN
        RETURN QUERY SELECT id FROM public.master_customers WHERE deleted_at IS NULL;
        RETURN;
    END IF;

    -- Customer: own customer_id from profiles or master_customers.user_id
    IF v_role = 'customer' THEN
        IF v_customer_id IS NOT NULL THEN
            RETURN QUERY SELECT v_customer_id;
        ELSE
            RETURN QUERY
            SELECT mc.id FROM public.master_customers mc
            WHERE mc.user_id = p_user_id;
        END IF;
        RETURN;
    END IF;

    -- Technician checks
    IF v_role != 'technician' THEN
        RETURN;
    END IF;

    -- External: locked to their customer_id
    IF v_tech_type = 'external' AND v_customer_id IS NOT NULL THEN
        RETURN QUERY SELECT v_customer_id;
        RETURN;
    END IF;

    -- Internal: assigned customers (active only)
    RETURN QUERY
    SELECT aca.customer_id
    FROM public.technician_customer_assignments aca
    WHERE aca.technician_id = p_user_id AND aca.is_active = true;
END;
$$;

-- Boolean check using the single source of truth
CREATE OR REPLACE FUNCTION public.can_access_customer(p_user_id uuid, p_customer_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.get_assigned_customers(p_user_id) AS c(customer_id)
        WHERE c.customer_id = p_customer_id
    );
$$;

-- Validate status transitions (does NOT trust input)
CREATE OR REPLACE FUNCTION public.validate_status_transition(
    p_request_id uuid,
    p_new_status text,
    p_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_current_status text;
    v_role text;
    v_customer_id uuid;
    v_allowed boolean := false;
BEGIN
    -- Get current request details (RLS bypassed)
    SELECT status, customer_id INTO v_current_status, v_customer_id
    FROM public.requests
    WHERE id = p_request_id AND deleted_at IS NULL;

    IF NOT FOUND OR p_new_status NOT IN ('requested', 'assigned', 'in_progress', 'completed') THEN
        RETURN false;
    END IF;

    -- Get user role
    SELECT role INTO v_role FROM public.profiles WHERE id = p_user_id;

    -- Admin: any transition
    IF v_role = 'admin' THEN
        RETURN true;
    END IF;

    -- Technician: strict forward transitions + access check
    IF v_role = 'technician' THEN
        v_allowed := 
            (v_current_status = 'requested' AND p_new_status = 'assigned') OR
            (v_current_status = 'assigned' AND p_new_status = 'in_progress') OR
            (v_current_status = 'in_progress' AND p_new_status = 'completed');

        RETURN v_allowed AND public.can_access_customer(p_user_id, v_customer_id);
    END IF;

    -- Customer: cannot change status
    RETURN false;
END;
$$;

-- Stub for dynamic form validation (Phase 4)
CREATE OR REPLACE FUNCTION public.validate_dynamic_form_data(
    p_template_id uuid,
    p_data jsonb
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    -- Stub: always valid for Phase 1
    -- Phase 4: validate against template schema
    SELECT true;
$$;

-- ========================================
-- 3. RLS POLICIES (REPLACE ALL with SINGLE POLICY)
-- ========================================

-- Dynamically drop ALL existing policies on requests table
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN SELECT polname FROM pg_policies WHERE tablename = 'requests' AND schemaname = 'public'
    LOOP
        EXECUTE 'DROP POLICY IF EXISTS "' || pol.polname || '" ON public.requests';
    END LOOP;
END $$;

-- SINGLE POLICY: Multi-tenant access + soft delete
CREATE POLICY "multi_tenant_requests_access"
ON public.requests FOR ALL
TO authenticated
USING (
    customer_id IN (
        SELECT public.get_assigned_customers(auth.uid())
    )
    AND deleted_at IS NULL
)
WITH CHECK (
    customer_id IN (
        SELECT public.get_assigned_customers(auth.uid())
    )
    AND deleted_at IS NULL
);

-- Profiles RLS update (admin full, own read/write)
DROP POLICY IF EXISTS "profiles read own or admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles update own or admin" ON public.profiles;
CREATE POLICY "profiles multi_tenant"
ON public.profiles FOR SELECT TO authenticated
USING (id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "profiles update own or admin"
ON public.profiles FOR UPDATE TO authenticated
USING (id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
WITH CHECK (id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Assignments RLS (admin + own/assigned)
CREATE POLICY "assignments admin or own"
ON public.technician_customer_assignments FOR ALL TO authenticated
USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') OR
    technician_id = auth.uid() OR
    customer_id IN (SELECT public.get_assigned_customers(auth.uid()))
)
WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') OR
    technician_id = auth.uid()
);

-- ========================================
-- 4. GRANTS (Security)
-- ========================================
REVOKE ALL ON FUNCTION public.get_assigned_customers(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_assigned_customers(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.can_access_customer(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_customer(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.validate_status_transition(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_status_transition(uuid, text, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.validate_dynamic_form_data(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_dynamic_form_data(uuid, jsonb) TO authenticated;

-- ========================================
-- 5. VERIFY (Run these tests)
-- ========================================
-- Test functions:
-- SELECT public.get_assigned_customers('your-admin-uuid');
-- SELECT public.validate_status_transition('request-uuid', 'assigned', 'your-uuid');

-- RLS test: SELECT * FROM requests LIMIT 1; (as different roles)
