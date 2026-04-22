type Props = {
    dashboardName: string;
    worksheets: string[];
    filterCount: number;
  };
  
  export default function DashboardMeta({ dashboardName, worksheets, filterCount }: Props) {
    return (
      <div className="meta-grid">
        <div className="meta-card">
          <div className="meta-label">Dashboard</div>
          <div className="meta-value">{dashboardName}</div>
        </div>
        <div className="meta-card">
          <div className="meta-label">Worksheets</div>
          <div className="meta-value">{worksheets.length}</div>
        </div>
        <div className="meta-card">
          <div className="meta-label">Known Filters</div>
          <div className="meta-value">{filterCount}</div>
        </div>
      </div>
    );
  }