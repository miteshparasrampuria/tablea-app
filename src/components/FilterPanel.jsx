import React, { useState } from "react";

export default function FilterPanel({ onApplyFilter, onClearFilter }) {
  const [field, setField] = useState("");
  const [value, setValue] = useState("");

  return (
    <div className="filter-panel">
      <h3>Manual Filter Controls</h3>

      <label className="label">Field Name</label>
      <input
        className="input"
        placeholder="Example: Region"
        value={field}
        onChange={(e) => setField(e.target.value)}
      />

      <label className="label">Value</label>
      <input
        className="input"
        placeholder="Example: East"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />

      <div className="button-row">
        <button
          className="primary-btn"
          onClick={() => onApplyFilter(field, value)}
          type="button"
        >
          Apply Filter
        </button>

        <button
          className="secondary-btn"
          onClick={() => onClearFilter(field)}
          type="button"
        >
          Clear Filter
        </button>
      </div>
    </div>
  );
}