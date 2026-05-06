import { useEffect, useState, useCallback } from 'react';
import supabase from '../supabaseClient';

/**
 * Hook to manage technician assignments
 * Handles assigning/unassigning technicians to/from customers
 */
export function useTechnicianAssignments() {
  const [assignments, setAssignments] = useState([]);
  const [technicianAssignments, setTechnicianAssignments] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Get all technicians for a specific customer
  const getTechniciansForCustomer = useCallback(async (customerId) => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.rpc('get_technicians_for_customer', {
        p_customer_id: customerId,
      });

      if (err) throw err;
      return data || [];
    } catch (err) {
      console.error('Error fetching technicians for customer:', err);
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  // Get all assignments for a specific technician
  const getAssignmentsForTechnician = useCallback(async (technicianId) => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.rpc('get_technician_assignments', {
        p_technician_id: technicianId,
      });

      if (err) throw err;
      return data || [];
    } catch (err) {
      console.error('Error fetching assignments for technician:', err);
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  // Assign internal technician to customer
  const assignTechnicianToCustomer = useCallback(async (technicianId, customerId) => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.rpc('assign_technician_to_customer', {
        p_technician_id: technicianId,
        p_customer_id: customerId,
      });

      if (err) throw err;

      if (data && data[0] && data[0].success) {
        // Refresh assignments after successful assignment
        const updatedAssignments = await getAssignmentsForTechnician(technicianId);
        setTechnicianAssignments({
          ...technicianAssignments,
          [technicianId]: updatedAssignments,
        });
        return { success: true, message: data[0].message };
      } else {
        return { success: false, message: data?.[0]?.message || 'Assignment failed' };
      }
    } catch (err) {
      console.error('Error assigning technician:', err);
      const message = err.message || 'Failed to assign technician';
      setError(message);
      return { success: false, message };
    } finally {
      setLoading(false);
    }
  }, [technicianAssignments, getAssignmentsForTechnician]);

  // Unassign internal technician from customer
  const unassignTechnicianFromCustomer = useCallback(async (technicianId, customerId) => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.rpc('unassign_technician_from_customer', {
        p_technician_id: technicianId,
        p_customer_id: customerId,
      });

      if (err) throw err;

      if (data && data[0] && data[0].success) {
        // Refresh assignments after successful unassignment
        const updatedAssignments = await getAssignmentsForTechnician(technicianId);
        setTechnicianAssignments({
          ...technicianAssignments,
          [technicianId]: updatedAssignments,
        });
        return { success: true, message: data[0].message };
      } else {
        return { success: false, message: data?.[0]?.message || 'Unassignment failed' };
      }
    } catch (err) {
      console.error('Error unassigning technician:', err);
      const message = err.message || 'Failed to unassign technician';
      setError(message);
      return { success: false, message };
    } finally {
      setLoading(false);
    }
  }, [technicianAssignments, getAssignmentsForTechnician]);

  // Assign external technician to customer
  const assignExternalTechnician = useCallback(async (technicianId, customerId) => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.rpc('assign_external_technician', {
        p_technician_id: technicianId,
        p_customer_id: customerId,
      });

      if (err) throw err;

      if (data && data[0] && data[0].success) {
        return { success: true, message: data[0].message };
      } else {
        return { success: false, message: data?.[0]?.message || 'Assignment failed' };
      }
    } catch (err) {
      console.error('Error assigning external technician:', err);
      const message = err.message || 'Failed to assign external technician';
      setError(message);
      return { success: false, message };
    } finally {
      setLoading(false);
    }
  }, []);

  // Unassign external technician
  const unassignExternalTechnician = useCallback(async (technicianId) => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.rpc('unassign_external_technician', {
        p_technician_id: technicianId,
      });

      if (err) throw err;

      if (data && data[0] && data[0].success) {
        return { success: true, message: data[0].message };
      } else {
        return { success: false, message: data?.[0]?.message || 'Unassignment failed' };
      }
    } catch (err) {
      console.error('Error unassigning external technician:', err);
      const message = err.message || 'Failed to unassign external technician';
      setError(message);
      return { success: false, message };
    } finally {
      setLoading(false);
    }
  }, []);

  // Check if technician can access customer
  const checkTechnicianAccess = useCallback(async (technicianId, customerId) => {
    try {
      const { data, error: err } = await supabase.rpc('technician_can_access_customer', {
        p_technician_id: technicianId,
        p_customer_id: customerId,
      });

      if (err) throw err;
      return data || false;
    } catch (err) {
      console.error('Error checking technician access:', err);
      return false;
    }
  }, []);

  return {
    assignments,
    technicianAssignments,
    loading,
    error,
    getTechniciansForCustomer,
    getAssignmentsForTechnician,
    assignTechnicianToCustomer,
    unassignTechnicianFromCustomer,
    assignExternalTechnician,
    unassignExternalTechnician,
    checkTechnicianAccess,
  };
}
