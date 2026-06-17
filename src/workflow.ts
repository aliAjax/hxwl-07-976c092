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
  type: "count" | "percentage";
  source: "records" | "defects" | "reviews";
  filter?: {
    status?: string[];
    field?: string;
    value?: string;
  };
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
