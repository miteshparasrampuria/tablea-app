export type FilterCondition = {
    field: string;
    operator: "equals" | "in" | "greater_than" | "less_than" | string;
    value: string | number | Array<string | number>;
  };
  
  export type AgentResponse = {
    intent: "answer_only" | "filter_only" | "clarification_needed" | string;
    answer_text: string;
    filters?: FilterCondition[];
    measure?: string | null;
    clarification_question?: string | null;
    confidence?: number;
  };
  
  export type TableauFilter = {
    field: string;
    filterType?: string;
    appliedValues?: Array<string | number>;
    minValue?: string | number;
    maxValue?: string | number;
  };
  
  export type WorksheetContext = {
    worksheet_name: string;
    current_filters: TableauFilter[];
  };
  
  export type DashboardContext = {
    dashboard_name: string;
    worksheets: string[];
    available_filters: Array<{
      field: string;
      type: string;
      allowed_values: Array<string | number>;
    }>;
    worksheet_contexts: WorksheetContext[];
    available_measures: string[];
    available_chart_types: string[];
  };
  
  declare global {
    interface Window {
      tableau?: any;
    }
  }