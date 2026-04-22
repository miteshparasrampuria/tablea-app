import { FilterCondition } from "../lib/types";

type Props = {
  answer: string;
  intent: string;
  confidence: number | null;
  appliedFilters: FilterCondition[];
};

export default function ResponsePanel({ answer, intent, confidence, appliedFilters }: Props) {
  return (
    <div className="panel">
      <div className="panel-header">Agent Response</div>
      <div className="answer-box">{answer || "No response yet."}</div>

      <div className="response-meta-row">
        <div className="pill pill-soft">Intent: {intent || "n/a"}</div>
        <div className="pill pill-soft">
          Confidence: {confidence !== null ? confidence.toFixed(2) : "n/a"}
        </div>
      </div>

      <div>
        <div className="section-label">Applied Filters</div>
        {appliedFilters.length === 0 ? (
          <div className="muted-text">No filters applied yet.</div>
        ) : (
          <div className="chip-wrap">
            {appliedFilters.map((filter, index) => (
              <div className="chip" key={`${filter.field}-${index}`}>
                {filter.field}: {Array.isArray(filter.value) ? filter.value.join(", ") : String(filter.value)}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}