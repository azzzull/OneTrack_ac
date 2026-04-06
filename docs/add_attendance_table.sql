-- Create attendance table for check-in/check-out tracking
CREATE TABLE IF NOT EXISTS attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  attendance_date DATE NOT NULL,
  
  -- Check-in fields
  check_in_time TIMESTAMP WITH TIME ZONE,
  check_in_latitude NUMERIC,
  check_in_longitude NUMERIC,
  check_in_street_address TEXT,
  check_in_district TEXT,
  check_in_sub_district TEXT,
  check_in_postal_code TEXT,
  check_in_accuracy_meters NUMERIC,
  
  -- Check-out fields
  check_out_time TIMESTAMP WITH TIME ZONE,
  check_out_latitude NUMERIC,
  check_out_longitude NUMERIC,
  check_out_street_address TEXT,
  check_out_district TEXT,
  check_out_sub_district TEXT,
  check_out_postal_code TEXT,
  check_out_accuracy_meters NUMERIC,
  
  -- Calculated field (in minutes)
  working_hours_minutes NUMERIC,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT unique_attendance_per_day UNIQUE(technician_id, attendance_date)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_attendance_technician_date 
  ON attendance(technician_id, attendance_date);
CREATE INDEX IF NOT EXISTS idx_attendance_technician_created 
  ON attendance(technician_id, created_at);

-- Enable RLS
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Technicians can INSERT their own attendance (once per day via UNIQUE constraint)
CREATE POLICY attendance_technician_insert ON attendance
  FOR INSERT
  WITH CHECK (
    auth.uid() = technician_id 
    AND auth.role() = 'authenticated'
  );

-- RLS Policy: Technicians can SELECT their own attendance
CREATE POLICY attendance_technician_select ON attendance
  FOR SELECT
  USING (
    auth.uid() = technician_id
  );

-- RLS Policy: Technicians can UPDATE their own attendance (for check-out)
CREATE POLICY attendance_technician_update ON attendance
  FOR UPDATE
  USING (
    auth.uid() = technician_id
  );

-- RLS Policy: Admins can SELECT all attendance
CREATE POLICY attendance_admin_select ON attendance
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- RLS Policy: Admins can UPDATE all attendance
CREATE POLICY attendance_admin_update ON attendance
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Create function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_attendance_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
DROP TRIGGER IF EXISTS attendance_updated_at_trigger ON attendance;
CREATE TRIGGER attendance_updated_at_trigger
BEFORE UPDATE ON attendance
FOR EACH ROW
EXECUTE FUNCTION update_attendance_updated_at();
