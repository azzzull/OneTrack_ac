-- ========================================
-- PHASE 1 FINAL (PRODUCTION SAFE)
-- ========================================

-- ========== 1. SCHEMA ==========

-- profiles extension
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS technician_type text
CHECK (technician_type IN ('internal', 'external') OR technician_type IS NULL),
ADD COLUMN IF NOT EXISTS customer_id uuid
REFERENCES public.master_customers(id) ON DELETE SET NULL;

-- requests extension
ALTER TABLE public.requests
ADD COLUMN IF NOT EXISTS job_scope text DEFAULT 'AC'
CHECK (job_scope IN ('AC','ELECTRICAL','ELEVATOR','GENSET','PLUMBING','FIRE_ALARM','CIVIL')),
ADD COLUMN IF NOT EXISTS dynamic_data jsonb,
ADD COLUMN IF NOT EXISTS form_template_id uuid,
ADD COLUMN IF NOT EXISTS form_template_version uuid,
ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- backfill
UPDATE public.requests SET job_scope = 'AC' WHERE job_scope IS NULL;

-- status constraint (BACKWARD SAFE)
ALTER TABLE public.requests DROP CONSTRAINT IF EXISTS requests_status_check;
ALTER TABLE public.requests ADD CONSTRAINT requests_status_check
CHECK (status IN ('pending','requested','assigned','in_progress','completed'));

ALTER TABLE public.requests ALTER COLUMN status SET DEFAULT 'requested';

-- assignments table
CREATE TABLE IF NOT EXISTS public.technician_customer_assignments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    technician_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    customer_id uuid NOT NULL REFERENCES public.master_customers(id) ON DELETE CASCADE,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    UNIQUE(technician_id, customer_id)
);

-- indexes
CREATE INDEX IF NOT EXISTS idx_requests_customer_id ON public.requests(customer_id);
CREATE INDEX IF NOT EXISTS idx_requests_status ON public.requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_job_scope ON public.requests(job_scope);
CREATE INDEX IF NOT EXISTS idx_requests_deleted_at ON public.requests(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_requests_customer_status ON public.requests(customer_id, status);

CREATE INDEX IF NOT EXISTS idx_assignments_technician_id 
ON public.technician_customer_assignments(technician_id);

CREATE INDEX IF NOT EXISTS idx_assignments_customer_id 
ON public.technician_customer_assignments(customer_id) WHERE is_active = true;

-- enable RLS
ALTER TABLE public.technician_customer_assignments ENABLE ROW LEVEL SECURITY;

-- ========== 2. FUNCTIONS ==========

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
    SELECT role, technician_type, customer_id
    INTO v_role, v_tech_type, v_customer_id
    FROM public.profiles
    WHERE id = p_user_id;

    IF v_role IS NULL THEN
        RETURN;
    END IF;

    -- admin: all customers
    IF v_role = 'admin' THEN
        RETURN QUERY
        SELECT id FROM public.master_customers WHERE deleted_at IS NULL;
        RETURN;
    END IF;

    -- customer
    IF v_role = 'customer' THEN
        IF v_customer_id IS NOT NULL THEN
            RETURN QUERY SELECT v_customer_id;
        ELSE
            RETURN QUERY
            SELECT mc.id
            FROM public.master_customers mc
            WHERE mc.user_id = p_user_id;
        END IF;
        RETURN;
    END IF;

    -- technician
    IF v_role != 'technician' THEN
        RETURN;
    END IF;

    -- external technician
    IF v_tech_type = 'external' AND v_customer_id IS NOT NULL THEN
        RETURN QUERY SELECT v_customer_id;
        RETURN;
    END IF;

    -- internal technician
    RETURN QUERY
    SELECT customer_id
    FROM public.technician_customer_assignments
    WHERE technician_id = p_user_id AND is_active = true;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_access_customer(p_user_id uuid, p_customer_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
SELECT EXISTS (
    SELECT 1
    FROM public.get_assigned_customers(p_user_id) AS c(customer_id)
    WHERE c.customer_id = p_customer_id
);
$$;

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
BEGIN
    SELECT status, customer_id
    INTO v_current_status, v_customer_id
    FROM public.requests
    WHERE id = p_request_id AND deleted_at IS NULL;

    IF NOT FOUND OR p_new_status NOT IN ('requested','assigned','in_progress','completed') THEN
        RETURN false;
    END IF;

    SELECT role INTO v_role FROM public.profiles WHERE id = p_user_id;

    -- admin bebas
    IF v_role = 'admin' THEN
        RETURN true;
    END IF;

    -- technician forward only
    IF v_role = 'technician' THEN
        RETURN (
            (v_current_status = 'requested' AND p_new_status = 'assigned') OR
            (v_current_status = 'assigned' AND p_new_status = 'in_progress') OR
            (v_current_status = 'in_progress' AND p_new_status = 'completed')
        ) AND public.can_access_customer(p_user_id, v_customer_id);
    END IF;

    RETURN false;
END;
$$;

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
SELECT true;
$$;

-- ========== 3. RLS ==========

DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'requests'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.requests', pol.policyname);
    END LOOP;
END $$;

CREATE POLICY multi_tenant_requests_access
ON public.requests FOR ALL TO authenticated
USING (
    customer_id IN (SELECT public.get_assigned_customers(auth.uid()))
    AND deleted_at IS NULL
)
WITH CHECK (
    customer_id IN (SELECT public.get_assigned_customers(auth.uid()))
    AND deleted_at IS NULL
);

-- ========== 4. GRANTS ==========

REVOKE ALL ON FUNCTION public.get_assigned_customers(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_assigned_customers(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.can_access_customer(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_customer(uuid, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.validate_status_transition(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_status_transition(uuid, text, uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.validate_dynamic_form_data(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_dynamic_form_data(uuid, jsonb) TO authenticated;

-- ========== VERIFY ==========
/*
SELECT get_assigned_customers(auth.uid());
SELECT * FROM requests LIMIT 3;
SELECT validate_status_transition(gen_random_uuid(), 'in_progress', auth.uid());
*/
