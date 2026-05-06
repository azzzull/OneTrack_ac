import React from "react";
import { JOB_SCOPE_LABELS, JOB_SCOPES } from "../utils/jobScopeCatalog";
import "../styles/JobScopeSelector.css";

/**
 * JobScopeSelector Component
 * Allows users to select the job scope (AC, ELECTRICAL, ELEVATOR, etc.)
 * Used in job creation and filtering
 */
const JobScopeSelector = ({
    selectedScope = JOB_SCOPES.AC,
    onChange,
    disabled = false,
    showLabel = true,
    className = "",
    style = {},
}) => {
    return (
        <div className={`job-scope-selector ${className}`} style={style}>
            {showLabel && (
                <label htmlFor="job-scope-select" className="job-scope-label">
                    Job Scope
                </label>
            )}
            <select
                id="job-scope-select"
                value={selectedScope}
                onChange={(e) => onChange?.(e.target.value)}
                disabled={disabled}
                className="job-scope-select"
            >
                {Object.values(JOB_SCOPES).map((scope) => (
                    <option key={scope} value={scope}>
                        {JOB_SCOPE_LABELS[scope]}
                    </option>
                ))}
            </select>
        </div>
    );
};

export default JobScopeSelector;
