export type UserRole = "维修工程师" | "放行人员" | "培训教员";

export type FieldType = "text" | "textarea" | "select" | "date";

export interface FieldConfig {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  placeholder?: string;
  options?: string[];
  fullWidth?: boolean;
}

export interface CheckStep {
  id: string;
  name: string;
  description: string;
  fields: string[];
  order: number;
}

export interface StatusTransition {
  from: string;
  to: string;
  label: string;
  allowedRoles: UserRole[];
  requiredFields?: string[];
  colorClass?: string;
}

export interface MetricConfig {
  key: string;
  label: string;
  type: "count" | "percentage" | "distinctCount";
  source: "records" | "defects" | "reviews";
  filter?: {
    status?: string[];
    field?: string;
    value?: string;
  };
  distinctField?: string;
  colorIndex: number;
}

export interface FilterConfig {
  key: string;
  label: string;
  type: "area" | "status" | "ata";
  matchField: string;
}

export interface WorkflowConfig {
  id: string;
  aircraftType: string;
  ataChapter: string;
  checkArea: string;
  displayName: string;
  steps: CheckStep[];
  fields: FieldConfig[];
  statuses: string[];
  statusTransitions: StatusTransition[];
  initialStatus: string;
  metrics: MetricConfig[];
  filters: FilterConfig[];
  rolePermissions: {
    [key in UserRole]: {
      canEdit: string[];
      canView: boolean;
      canCreateDefect?: boolean;
      canReview?: boolean;
    };
  };
}

export interface WorkflowEngineState {
  configs: WorkflowConfig[];
  activeConfigId: string | null;
}

export function getAllAircraftTypes(configs: WorkflowConfig[]): string[] {
  return Array.from(new Set(configs.map(c => c.aircraftType))).sort();
}

export function getAtaChaptersByAircraft(configs: WorkflowConfig[], aircraftType: string): string[] {
  return Array.from(
    new Set(
      configs
        .filter(c => c.aircraftType === aircraftType)
        .map(c => c.ataChapter)
    )
  ).sort();
}

export function getCheckAreasByAircraftAndAta(
  configs: WorkflowConfig[],
  aircraftType: string,
  ataChapter: string
): string[] {
  return Array.from(
    new Set(
      configs
        .filter(c => c.aircraftType === aircraftType && c.ataChapter === ataChapter)
        .map(c => c.checkArea)
    )
  ).sort();
}

export function findWorkflowConfig(
  configs: WorkflowConfig[],
  aircraftType: string,
  ataChapter: string,
  checkArea: string
): WorkflowConfig | undefined {
  return configs.find(
    c => c.aircraftType === aircraftType &&
         c.ataChapter === ataChapter &&
         c.checkArea === checkArea
  );
}

export function getDefaultWorkflow(configs: WorkflowConfig[]): WorkflowConfig | undefined {
  return configs[0];
}

export function getAvailableStatusTransitions(
  config: WorkflowConfig,
  currentStatus: string,
  role: UserRole
): StatusTransition[] {
  return config.statusTransitions.filter(
    t => t.from === currentStatus && t.allowedRoles.includes(role)
  );
}

export function getRequiredFieldsForStatus(
  config: WorkflowConfig,
  status: string
): FieldConfig[] {
  const step = config.steps.find(s => s.name === status);
  if (!step) return [];
  return config.fields.filter(f => step.fields.includes(f.key) && f.required);
}

export function getFieldsForStep(
  config: WorkflowConfig,
  stepId: string
): FieldConfig[] {
  const step = config.steps.find(s => s.id === stepId);
  if (!step) return [];
  return config.fields.filter(f => step.fields.includes(f.key));
}

export function canRoleEditField(
  config: WorkflowConfig,
  fieldKey: string,
  role: UserRole
): boolean {
  const permissions = config.rolePermissions[role];
  if (!permissions) return false;
  return permissions.canEdit.includes(fieldKey);
}

export function getStatusBadgeClass(status: string): string {
  const s = status.toLowerCase();
  if (s.includes("正常") || s.includes("完成") || s.includes("通过")) return "status-badge-ok";
  if (s.includes("待复核") || s.includes("待") || s.includes("处理中")) return "status-badge-watch";
  if (s.includes("缺陷") || s.includes("驳回") || s.includes("退回")) return "status-badge-danger";
  return "status-badge-default";
}

export function getDefectStatusBadgeClass(status: string): string {
  switch (status) {
    case "pending":
      return "defect-status-badge-pending";
    case "processing":
      return "defect-status-badge-processing";
    case "completed":
      return "defect-status-badge-completed";
    case "rejected":
      return "defect-status-badge-rejected";
    default:
      return "defect-status-badge-pending";
  }
}

export function getDefectStatusText(status: string): string {
  switch (status) {
    case "pending":
      return "待处理";
    case "processing":
      return "处理中";
    case "completed":
      return "已完成";
    case "rejected":
      return "已退回";
    default:
      return status;
  }
}

export type StatusCategory = "normal" | "pending" | "defect";

export function getStatusCategory(status: string): StatusCategory {
  const s = status.toLowerCase();
  if (s.includes("缺陷") || s.includes("驳回") || s.includes("退回")) return "defect";
  if (s.includes("待复核") || s.includes("待") || s.includes("处理中")) return "pending";
  return "normal";
}

export function validateRequiredFields(
  fields: FieldConfig[],
  formData: Record<string, string>
): { valid: boolean; missingFields: string[] } {
  const missingFields: string[] = [];
  fields.forEach(field => {
    if (field.required && (!formData[field.key] || formData[field.key].trim() === "")) {
      missingFields.push(field.label);
    }
  });
  return { valid: missingFields.length === 0, missingFields };
}

export function calculateMetricValue(
  metric: MetricConfig,
  records: any[],
  defects: any[],
  reviews: Record<string, any>
): string {
  const { type, source, filter } = metric;

  let dataSource: any[];
  switch (source) {
    case "records":
      dataSource = records;
      break;
    case "defects":
      dataSource = Object.values(defects);
      break;
    case "reviews":
      dataSource = Object.values(reviews);
      break;
    default:
      dataSource = [];
  }

  let filteredData = dataSource;
  if (filter) {
    if (filter.status && filter.status.length > 0) {
      if (source === "records") {
        filteredData = filteredData.filter((item: any) =>
          filter.status!.some(s => item.status.includes(s))
        );
      } else {
        filteredData = filteredData.filter((item: any) =>
          filter.status!.includes(item.status)
        );
      }
    }
    if (filter.field && filter.value) {
      filteredData = filteredData.filter(
        (item: any) => item[filter.field!] === filter.value
      );
    }
  }

  if (type === "count") {
    return String(filteredData.length);
  }

  if (type === "distinctCount" && metric.distinctField) {
    const distinctValues = new Set(filteredData.map(item => item[metric.distinctField!]));
    return String(distinctValues.size);
  }

  if (type === "percentage") {
    const total = dataSource.length;
    if (total === 0) return "0%";
    return `${Math.round((filteredData.length / total) * 100)}%`;
  }

  return "0";
}

export function getMatrixCellStatus(
  records: any[],
  statuses: string[]
): StatusCategory | "not-started" {
  if (records.length === 0) return "not-started";

  for (const status of statuses) {
    const category = getStatusCategory(status);
    if (category === "defect" && records.some(r => r.status === status)) {
      return "defect";
    }
  }
  for (const status of statuses) {
    const category = getStatusCategory(status);
    if (category === "pending" && records.some(r => r.status === status)) {
      return "pending";
    }
  }
  return "normal";
}

export function groupRecordsByStatus(
  records: any[],
  statuses: string[]
): Record<StatusCategory, any[]> {
  const groups: Record<StatusCategory, any[]> = {
    normal: [],
    pending: [],
    defect: []
  };

  records.forEach(record => {
    const category = getStatusCategory(record.status);
    groups[category].push(record);
  });

  return groups;
}

export function getRecordDisplayFields(
  config: WorkflowConfig | undefined,
  record: any
): { label: string; value: string }[] {
  const fields: { label: string; value: string }[] = [];

  if (config) {
    config.fields.forEach(field => {
      const value = record[field.key];
      if (value && value.trim() !== "") {
        fields.push({ label: field.label, value });
      }
    });
  } else {
    const defaultFields = [
      { key: "ataChapter", label: "ATA章节" },
      { key: "checkArea", label: "检查区域" },
      { key: "status", label: "状态" },
      { key: "defectDesc", label: "缺陷描述" }
    ];
    defaultFields.forEach(field => {
      const value = record[field.key];
      if (value && value.trim() !== "") {
        fields.push({ label: field.label, value });
      }
    });
  }

  return fields;
}

export function canCreateDefect(
  config: WorkflowConfig | undefined,
  role: UserRole,
  recordStatus: string
): boolean {
  if (!config) {
    return role === "维修工程师" && recordStatus.includes("缺陷");
  }
  const permissions = config.rolePermissions[role];
  if (!permissions?.canCreateDefect) return false;
  return getStatusCategory(recordStatus) === "defect";
}

export function getStatusList(config: WorkflowConfig | undefined): string[] {
  if (!config) return ["待复核", "正常", "缺陷"];
  return config.statuses;
}

export function getInitialStatus(config: WorkflowConfig | undefined): string {
  if (!config) return "待复核";
  return config.initialStatus;
}
