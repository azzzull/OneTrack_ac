import React, { useEffect, useState } from 'react';
import { useTechnicianAssignments } from '../hooks/useTechnicianAssignments';
import supabase from '../supabaseClient';
import '../styles/TechnicianAssignmentManager.css';

/**
 * TechnicianAssignmentManager Component
 * Allows admins to assign/unassign technicians (internal and external) to/from customers
 */
const TechnicianAssignmentManager = ({ customerId, onAssignmentChange }) => {
  const [technicians, setTechnicians] = useState([]);
  const [currentAssignments, setCurrentAssignments] = useState([]);
  const [unassignedTechs, setUnassignedTechs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const {
    getTechniciansForCustomer,
    assignTechnicianToCustomer,
    unassignTechnicianFromCustomer,
  } = useTechnicianAssignments();

  // Fetch all technicians
  const fetchAllTechnicians = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email, technician_type, customer_id')
        .eq('role', 'technician')
        .order('first_name', { ascending: true });

      if (error) throw error;
      setTechnicians(data || []);
    } catch (err) {
      console.error('Error fetching technicians:', err);
      setMessage({ type: 'error', text: 'Failed to load technicians' });
    }
  };

  // Fetch current assignments for customer
  const fetchAssignments = async () => {
    if (!customerId) return;
    try {
      setLoading(true);
      const assigned = await getTechniciansForCustomer(customerId);
      setCurrentAssignments(assigned || []);
    } catch (err) {
      console.error('Error fetching assignments:', err);
      setMessage({ type: 'error', text: 'Failed to load assignments' });
    } finally {
      setLoading(false);
    }
  };

  // Calculate unassigned technicians
  const calculateUnassigned = () => {
    const assignedTechIds = new Set(currentAssignments.map((a) => a.technician_id));
    const unassigned = technicians.filter(
      (tech) =>
        !assignedTechIds.has(tech.id) &&
        (tech.technician_type === 'internal' || tech.customer_id !== customerId)
    );
    setUnassignedTechs(unassigned);
  };

  // Initialize on mount or when customerId changes
  useEffect(() => {
    fetchAllTechnicians();
    fetchAssignments();
  }, [customerId]);

  // Update unassigned techs when data changes
  useEffect(() => {
    calculateUnassigned();
  }, [technicians, currentAssignments]);

  // Handle assigning technician
  const handleAssign = async (technicianId) => {
    try {
      setLoading(true);
      const result = await assignTechnicianToCustomer(technicianId, customerId);

      if (result.success) {
        setMessage({ type: 'success', text: result.message });
        await fetchAssignments();
        onAssignmentChange?.();
      } else {
        setMessage({ type: 'error', text: result.message });
      }
    } finally {
      setLoading(false);
    }
  };

  // Handle unassigning technician
  const handleUnassign = async (technicianId) => {
    try {
      setLoading(true);
      const result = await unassignTechnicianFromCustomer(technicianId, customerId);

      if (result.success) {
        setMessage({ type: 'success', text: result.message });
        await fetchAssignments();
        onAssignmentChange?.();
      } else {
        setMessage({ type: 'error', text: result.message });
      }
    } finally {
      setLoading(false);
    }
  };

  // Format technician name
  const getTechName = (tech) => {
    return `${tech.first_name || ''} ${tech.last_name || ''}`.trim() || tech.email;
  };

  // Clear message after 3 seconds
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  if (!customerId) {
    return <div className="tam-container">Please select a customer first</div>;
  }

  return (
    <div className="tam-container">
      <div className="tam-header">
        <h3>Manage Technicians</h3>
      </div>

      {message && <div className={`tam-message tam-${message.type}`}>{message.text}</div>}

      <div className="tam-grid">
        {/* Current Assignments */}
        <div className="tam-column">
          <h4>Assigned Technicians ({currentAssignments.length})</h4>
          {loading && currentAssignments.length === 0 ? (
            <div className="tam-loading">Loading...</div>
          ) : currentAssignments.length > 0 ? (
            <ul className="tam-list">
              {currentAssignments.map((assignment) => (
                <li key={assignment.technician_id} className="tam-item">
                  <div className="tam-item-info">
                    <div className="tam-item-name">{assignment.technician_name}</div>
                    <div className="tam-item-email">{assignment.email}</div>
                    <div className="tam-item-assigned">
                      Assigned: {new Date(assignment.assigned_at).toLocaleDateString()}
                    </div>
                  </div>
                  <button
                    className="tam-btn-remove"
                    onClick={() => handleUnassign(assignment.technician_id)}
                    disabled={loading}
                    title="Remove assignment"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="tam-empty">No technicians assigned yet</div>
          )}
        </div>

        {/* Available Technicians */}
        <div className="tam-column">
          <h4>Available Technicians ({unassignedTechs.length})</h4>
          {unassignedTechs.length > 0 ? (
            <ul className="tam-list">
              {unassignedTechs.map((tech) => (
                <li key={tech.id} className="tam-item">
                  <div className="tam-item-info">
                    <div className="tam-item-name">{getTechName(tech)}</div>
                    <div className="tam-item-email">{tech.email}</div>
                    <div className="tam-item-type">
                      Type: <span className={`tam-type-${tech.technician_type}`}>
                        {tech.technician_type}
                      </span>
                    </div>
                  </div>
                  <button
                    className="tam-btn-add"
                    onClick={() => handleAssign(tech.id)}
                    disabled={loading}
                    title="Assign technician"
                  >
                    Add
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="tam-empty">All technicians are assigned or unavailable</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TechnicianAssignmentManager;
