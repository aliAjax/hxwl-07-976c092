import { WorkflowConfig, FieldConfig, UserRole } from "../../src/workflow";

export const mockFields: FieldConfig[] = [
  { key: "aircraftType", label: "机型", type: "select", required: true, options: ["A320", "B737"], placeholder: "选择机型" },
  { key: "ataChapter", label: "ATA章节", type: "select", required: true, options: ["ATA 32", "ATA 24"], placeholder: "选择ATA章节" },
  { key: "checkArea", label: "检查区域", type: "select", required: true, options: ["起落架", "电源系统"], placeholder: "选择检查区域" },
  { key: "checkItem", label: "检查项目", type: "text", required: false, placeholder: "填写检查项目" },
  { key: "status", label: "状态", type: "select", required: true, options: ["待复核", "正常", "缺陷"], placeholder: "选择状态" },
  { key: "defectDesc", label: "缺陷描述", type: "textarea", required: false, placeholder: "填写缺陷描述", fullWidth: true },
  { key: "handling", label: "处理意见", type: "textarea", required: false, placeholder: "填写处理意见", fullWidth: true },
  { key: "signer", label: "签署人", type: "text", required: false, placeholder: "填写签署人", fullWidth: true },
];

export const mockWorkflowConfig: WorkflowConfig = {
  id: "test-config",
  aircraftType: "A320",
  ataChapter: "ATA 32",
  checkArea: "起落架",
  displayName: "A320 起落架常规检查",
  steps: [
    { id: "step-1", name: "待复核", description: "提交复核", fields: ["aircraftType", "ataChapter", "checkArea", "checkItem", "defectDesc", "handling"], order: 1 },
    { id: "step-2", name: "正常", description: "复核通过", fields: ["aircraftType", "ataChapter", "checkArea", "checkItem", "defectDesc", "handling", "signer"], order: 2 },
    { id: "step-3", name: "缺陷", description: "存在缺陷", fields: ["aircraftType", "ataChapter", "checkArea", "checkItem", "defectDesc", "handling", "signer"], order: 3 },
  ],
  fields: mockFields,
  statuses: ["待复核", "正常", "缺陷"],
  statusTransitions: [
    { from: "待复核", to: "正常", label: "通过复核", allowedRoles: ["放行人员"], colorClass: "pass-btn" },
    { from: "待复核", to: "缺陷", label: "标记缺陷", allowedRoles: ["放行人员", "维修工程师"], colorClass: "reject-btn" },
    { from: "缺陷", to: "正常", label: "修复完成", allowedRoles: ["放行人员"], requiredFields: ["handling"], colorClass: "pass-btn" },
    { from: "正常", to: "待复核", label: "重新复核", allowedRoles: ["培训教员", "放行人员"], colorClass: "reject-btn" },
  ],
  initialStatus: "待复核",
  metrics: [
    { key: "completionRate", label: "完成率", type: "percentage", source: "records", filter: { status: ["正常"] }, colorIndex: 0 },
    { key: "defectCount", label: "缺陷项", type: "count", source: "records", filter: { status: ["缺陷"] }, colorIndex: 2 },
    { key: "pendingReview", label: "待复核", type: "count", source: "records", filter: { status: ["待复核"] }, colorIndex: 1 },
  ],
  filters: [{ key: "landingGear", label: "起落架", type: "area", matchField: "checkArea" }],
  rolePermissions: {
    "维修工程师": {
      canEdit: ["aircraftType", "ataChapter", "checkArea", "checkItem", "defectDesc", "handling", "status"],
      canView: true,
      canCreateDefect: true,
    },
    "放行人员": {
      canEdit: ["status", "handling", "signer"],
      canView: true,
      canReview: true,
      canCreateDefect: true,
    },
    "培训教员": {
      canEdit: [],
      canView: true,
    },
  },
};

export const roles: UserRole[] = ["维修工程师", "放行人员", "培训教员"];

export const mockRecords = [
  { id: "r1", aircraftType: "A320", ataChapter: "ATA 32", checkArea: "起落架", checkItem: "主轮磨损", status: "正常", defectDesc: "", handling: "正常磨损", signer: "张工" },
  { id: "r2", aircraftType: "A320", ataChapter: "ATA 32", checkArea: "起落架", checkItem: "减震支柱", status: "待复核", defectDesc: "有轻微渗漏", handling: "", signer: "" },
  { id: "r3", aircraftType: "B737", ataChapter: "ATA 24", checkArea: "电源系统", checkItem: "电瓶测试", status: "缺陷", defectDesc: "电瓶容量不足", handling: "需更换电瓶", signer: "" },
  { id: "r4", aircraftType: "A320", ataChapter: "ATA 32", checkArea: "起落架", status: "正常", defectDesc: "", handling: "", signer: "李工" },
];

export const mockDefects: Record<string, any> = {
  d1: { id: "d1", aircraftType: "A320", ataChapter: "ATA 32", checkArea: "起落架", status: "pending", defectDesc: "主轮磨耗超标", priority: "high" },
  d2: { id: "d2", aircraftType: "B737", ataChapter: "ATA 24", checkArea: "电源系统", status: "processing", defectDesc: "APU发电机异常", priority: "medium" },
  d3: { id: "d3", aircraftType: "ARJ21", ataChapter: "ATA 27", checkArea: "飞控", status: "completed", defectDesc: "副翼响应迟缓", priority: "low" },
};

export const mockReviews: Record<string, any> = {
  r1: { id: "r1", status: "passed", reviewer: "张工", reviewedAt: Date.now() },
  r2: { id: "r2", status: "rejected", reviewer: "李工", reviewedAt: Date.now() - 86400000 },
};
