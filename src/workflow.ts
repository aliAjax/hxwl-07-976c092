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

export function getRoleVisibleFields(
  config: WorkflowConfig | undefined,
  role: UserRole
): FieldConfig[] {
  if (!config) {
    const defaultFields: FieldConfig[] = [
      { key: "aircraftType", label: "机型", type: "select", required: true, placeholder: "选择机型" },
      { key: "ataChapter", label: "ATA章节", type: "select", required: true, placeholder: "选择ATA章节" },
      { key: "checkArea", label: "检查区域", type: "select", required: true, placeholder: "选择检查区域" },
      { key: "checkItem", label: "检查项目", type: "text", required: false, placeholder: "填写检查项目" },
      { key: "status", label: "状态", type: "text", required: true, placeholder: "选择状态" },
      { key: "defectDesc", label: "缺陷描述", type: "text", required: false, placeholder: "填写缺陷描述" },
      { key: "handling", label: "处理意见", type: "text", required: false, placeholder: "填写处理意见" }
    ];
    if (role === "放行人员") {
      defaultFields.push({ key: "signer", label: "签署人", type: "text", required: false, placeholder: "填写签署人", fullWidth: true });
    }
    return defaultFields;
  }

  const permissions = config.rolePermissions[role];
  if (!permissions?.canView) return [];

  if (role === "培训教员") {
    return config.fields.filter(f =>
      f.key !== "signer" || true
    );
  }

  return config.fields;
}

export function canRolePerformAction(
  config: WorkflowConfig | undefined,
  role: UserRole,
  action: "create" | "edit" | "review" | "createDefect" | "addComment"
): boolean {
  if (action === "addComment") {
    return role === "培训教员";
  }
  if (!config) {
    switch (role) {
      case "维修工程师":
        return action === "create" || action === "edit" || action === "createDefect";
      case "放行人员":
        return action === "review" || action === "edit" || action === "createDefect";
      case "培训教员":
        return action === "addComment";
      default:
        return false;
    }
  }
  const permissions = config.rolePermissions[role];
  if (!permissions) return false;
  switch (action) {
    case "create":
      return permissions.canEdit.length > 0;
    case "edit":
      return permissions.canEdit.length > 0;
    case "review":
      return !!permissions.canReview;
    case "createDefect":
      return !!permissions.canCreateDefect;
    default:
      return false;
  }
}

export function getRoleEditableFields(
  config: WorkflowConfig | undefined,
  role: UserRole
): string[] {
  if (!config) {
    switch (role) {
      case "维修工程师":
        return ["aircraftType", "ataChapter", "checkArea", "checkItem", "defectDesc", "handling", "status"];
      case "放行人员":
        return ["status", "handling", "signer"];
      case "培训教员":
        return [];
      default:
        return [];
    }
  }
  const permissions = config.rolePermissions[role];
  return permissions?.canEdit || [];
}

export function getRoleSpecificMetrics(
  baseMetrics: MetricConfig[],
  role: UserRole
): MetricConfig[] {
  switch (role) {
    case "维修工程师":
      return [
        { key: "myRecords", label: "我的提交", type: "count" as const, source: "records" as const, colorIndex: 0 },
        baseMetrics.find(m => m.key === "pendingReview") || { key: "pendingReview", label: "待复核", type: "count" as const, source: "records" as const, filter: { status: ["待复核"] }, colorIndex: 1 },
        baseMetrics.find(m => m.key === "defectCount") || { key: "defectCount", label: "缺陷项", type: "count" as const, source: "records" as const, filter: { status: ["缺陷"] }, colorIndex: 2 },
        baseMetrics.find(m => m.key === "pendingDefects") || { key: "pendingDefects", label: "处理中缺陷", type: "count" as const, source: "defects" as const, filter: { status: ["processing"] }, colorIndex: 1 }
      ];
    case "放行人员":
      return [
        baseMetrics.find(m => m.key === "completionRate") || { key: "completionRate", label: "放行通过率", type: "percentage" as const, source: "records" as const, filter: { status: ["正常"] }, colorIndex: 0 },
        baseMetrics.find(m => m.key === "pendingReview") || { key: "pendingReview", label: "待复核", type: "count" as const, source: "records" as const, filter: { status: ["待复核"] }, colorIndex: 1 },
        baseMetrics.find(m => m.key === "defectCount") || { key: "defectCount", label: "缺陷项", type: "count" as const, source: "records" as const, filter: { status: ["缺陷"] }, colorIndex: 2 },
        { key: "reviewedToday", label: "今日复核", type: "count" as const, source: "reviews" as const, colorIndex: 0 }
      ];
    case "培训教员":
      return [
        baseMetrics.find(m => m.key === "completionRate") || { key: "completionRate", label: "整体完成率", type: "percentage" as const, source: "records" as const, filter: { status: ["正常"] }, colorIndex: 0 },
        baseMetrics.find(m => m.key === "defectCount") || { key: "defectCount", label: "缺陷项", type: "count" as const, source: "records" as const, filter: { status: ["缺陷"] }, colorIndex: 2 },
        { key: "commented", label: "已讲评", type: "count" as const, source: "records" as const, colorIndex: 0 },
        { key: "pendingComment", label: "待讲评", type: "count" as const, source: "records" as const, colorIndex: 1 }
      ];
    default:
      return baseMetrics;
  }
}

export function getRoleDescription(role: UserRole): string {
  switch (role) {
    case "维修工程师":
      return "负责提交检查记录、标记缺陷、处理缺陷项";
    case "放行人员":
      return "负责复核检查记录、签署放行意见、确认缺陷处置";
    case "培训教员":
      return "负责查看所有记录、填写培训讲评备注";
    default:
      return "";
  }
}
