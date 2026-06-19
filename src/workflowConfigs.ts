import { WorkflowConfig } from "./workflow";

export const workflowConfigs: WorkflowConfig[] = [
  {
    id: "a320-ata32-landing-gear",
    aircraftType: "A320",
    ataChapter: "ATA 32",
    checkArea: "起落架",
    displayName: "A320 起落架常规检查",
    steps: [
      {
        id: "step-1",
        name: "待复核",
        description: "维修工程师完成检查后提交复核",
        fields: ["aircraftType", "ataChapter", "checkArea", "checkItem", "defectDesc", "handling"],
        order: 1
      },
      {
        id: "step-2",
        name: "正常",
        description: "放行人员复核通过",
        fields: ["aircraftType", "ataChapter", "checkArea", "checkItem", "defectDesc", "handling", "signer"],
        order: 2
      },
      {
        id: "step-3",
        name: "缺陷",
        description: "存在缺陷需要处理",
        fields: ["aircraftType", "ataChapter", "checkArea", "checkItem", "defectDesc", "handling", "signer"],
        order: 3
      }
    ],
    fields: [
      {
        key: "aircraftType",
        label: "机型",
        type: "select",
        required: true,
        options: ["A320", "B737", "ARJ21"],
        placeholder: "选择机型"
      },
      {
        key: "ataChapter",
        label: "ATA章节",
        type: "select",
        required: true,
        options: ["ATA 21", "ATA 24", "ATA 27", "ATA 32", "ATA 33"],
        placeholder: "选择ATA章节"
      },
      {
        key: "checkArea",
        label: "检查区域",
        type: "select",
        required: true,
        options: ["机体", "动力装置", "航电", "起落架", "飞控", "电源系统"],
        placeholder: "选择检查区域"
      },
      {
        key: "checkItem",
        label: "检查项目",
        type: "text",
        required: false,
        placeholder: "填写检查项目"
      },
      {
        key: "status",
        label: "状态",
        type: "select",
        required: true,
        options: ["待复核", "正常", "缺陷"],
        placeholder: "选择状态"
      },
      {
        key: "defectDesc",
        label: "缺陷描述",
        type: "textarea",
        required: false,
        placeholder: "填写缺陷描述",
        fullWidth: true
      },
      {
        key: "handling",
        label: "处理意见",
        type: "textarea",
        required: false,
        placeholder: "填写处理意见",
        fullWidth: true
      },
      {
        key: "signer",
        label: "签署人",
        type: "text",
        required: false,
        placeholder: "填写签署人",
        fullWidth: true
      }
    ],
    statuses: ["待复核", "正常", "缺陷"],
    statusTransitions: [
      {
        from: "待复核",
        to: "正常",
        label: "通过复核",
        allowedRoles: ["放行人员"],
        colorClass: "pass-btn"
      },
      {
        from: "待复核",
        to: "缺陷",
        label: "标记缺陷",
        allowedRoles: ["放行人员", "维修工程师"],
        colorClass: "reject-btn"
      },
      {
        from: "缺陷",
        to: "正常",
        label: "修复完成",
        allowedRoles: ["放行人员"],
        requiredFields: ["handling"],
        colorClass: "pass-btn"
      },
      {
        from: "正常",
        to: "待复核",
        label: "重新复核",
        allowedRoles: ["培训教员", "放行人员"],
        colorClass: "reject-btn"
      }
    ],
    initialStatus: "待复核",
    metrics: [
      {
        key: "completionRate",
        label: "完成率",
        type: "percentage",
        source: "records",
        filter: { status: ["正常"] },
        colorIndex: 0
      },
      {
        key: "defectCount",
        label: "缺陷项",
        type: "count",
        source: "records",
        filter: { status: ["缺陷"] },
        colorIndex: 2
      },
      {
        key: "pendingReview",
        label: "待复核",
        type: "count",
        source: "records",
        filter: { status: ["待复核"] },
        colorIndex: 1
      },
      {
        key: "pendingDefects",
        label: "待处理缺陷",
        type: "count",
        source: "defects",
        filter: { status: ["pending", "processing"] },
        colorIndex: 1
      },
      {
        key: "ataChapters",
        label: "ATA章节",
        type: "count",
        source: "records",
        colorIndex: 0
      }
    ],
    filters: [
      {
        key: "landingGear",
        label: "起落架",
        type: "area",
        matchField: "checkArea"
      }
    ],
    rolePermissions: {
      "维修工程师": {
        canEdit: ["aircraftType", "ataChapter", "checkArea", "checkItem", "defectDesc", "handling", "status"],
        canView: true,
        canCreateDefect: true
      },
      "放行人员": {
        canEdit: ["status", "handling", "signer"],
        canView: true,
        canReview: true,
        canCreateDefect: true
      },
      "培训教员": {
        canEdit: [],
        canView: true
      }
    }
  },
  {
    id: "b737-ata24-power",
    aircraftType: "B737",
    ataChapter: "ATA 24",
    checkArea: "电源系统",
    displayName: "B737 电源系统检查",
    steps: [
      {
        id: "step-1",
        name: "待复核",
        description: "维修工程师完成检查后提交复核",
        fields: ["aircraftType", "ataChapter", "checkArea", "checkItem", "defectDesc", "handling"],
        order: 1
      },
      {
        id: "step-2",
        name: "正常",
        description: "放行人员复核通过",
        fields: ["aircraftType", "ataChapter", "checkArea", "checkItem", "defectDesc", "handling", "signer"],
        order: 2
      },
      {
        id: "step-3",
        name: "缺陷",
        description: "存在缺陷需要处理",
        fields: ["aircraftType", "ataChapter", "checkArea", "checkItem", "defectDesc", "handling", "signer"],
        order: 3
      }
    ],
    fields: [
      {
        key: "aircraftType",
        label: "机型",
        type: "select",
        required: true,
        options: ["A320", "B737", "ARJ21"],
        placeholder: "选择机型"
      },
      {
        key: "ataChapter",
        label: "ATA章节",
        type: "select",
        required: true,
        options: ["ATA 21", "ATA 24", "ATA 27", "ATA 32", "ATA 33"],
        placeholder: "选择ATA章节"
      },
      {
        key: "checkArea",
        label: "检查区域",
        type: "select",
        required: true,
        options: ["机体", "动力装置", "航电", "起落架", "飞控", "电源系统"],
        placeholder: "选择检查区域"
      },
      {
        key: "checkItem",
        label: "检查项目",
        type: "text",
        required: false,
        placeholder: "填写检查项目"
      },
      {
        key: "status",
        label: "状态",
        type: "select",
        required: true,
        options: ["待复核", "正常", "缺陷"],
        placeholder: "选择状态"
      },
      {
        key: "defectDesc",
        label: "缺陷描述",
        type: "textarea",
        required: false,
        placeholder: "填写缺陷描述",
        fullWidth: true
      },
      {
        key: "handling",
        label: "处理意见",
        type: "textarea",
        required: false,
        placeholder: "填写处理意见",
        fullWidth: true
      },
      {
        key: "signer",
        label: "签署人",
        type: "text",
        required: false,
        placeholder: "填写签署人",
        fullWidth: true
      }
    ],
    statuses: ["待复核", "正常", "缺陷"],
    statusTransitions: [
      {
        from: "待复核",
        to: "正常",
        label: "通过复核",
        allowedRoles: ["放行人员"],
        colorClass: "pass-btn"
      },
      {
        from: "待复核",
        to: "缺陷",
        label: "标记缺陷",
        allowedRoles: ["放行人员", "维修工程师"],
        colorClass: "reject-btn"
      },
      {
        from: "缺陷",
        to: "正常",
        label: "修复完成",
        allowedRoles: ["放行人员"],
        requiredFields: ["handling"],
        colorClass: "pass-btn"
      },
      {
        from: "正常",
        to: "待复核",
        label: "重新复核",
        allowedRoles: ["培训教员", "放行人员"],
        colorClass: "reject-btn"
      }
    ],
    initialStatus: "待复核",
    metrics: [
      {
        key: "completionRate",
        label: "完成率",
        type: "percentage",
        source: "records",
        filter: { status: ["正常"] },
        colorIndex: 0
      },
      {
        key: "defectCount",
        label: "缺陷项",
        type: "count",
        source: "records",
        filter: { status: ["缺陷"] },
        colorIndex: 2
      },
      {
        key: "pendingReview",
        label: "待复核",
        type: "count",
        source: "records",
        filter: { status: ["待复核"] },
        colorIndex: 1
      },
      {
        key: "pendingDefects",
        label: "待处理缺陷",
        type: "count",
        source: "defects",
        filter: { status: ["pending", "processing"] },
        colorIndex: 1
      },
      {
        key: "ataChapters",
        label: "ATA章节",
        type: "count",
        source: "records",
        colorIndex: 0
      }
    ],
    filters: [
      {
        key: "power",
        label: "电源系统",
        type: "area",
        matchField: "checkArea"
      }
    ],
    rolePermissions: {
      "维修工程师": {
        canEdit: ["aircraftType", "ataChapter", "checkArea", "checkItem", "defectDesc", "handling", "status"],
        canView: true,
        canCreateDefect: true
      },
      "放行人员": {
        canEdit: ["status", "handling", "signer"],
        canView: true,
        canReview: true,
        canCreateDefect: true
      },
      "培训教员": {
        canEdit: [],
        canView: true
      }
    }
  },
  {
    id: "arj21-ata27-flight-control",
    aircraftType: "ARJ21",
    ataChapter: "ATA 27",
    checkArea: "飞控",
    displayName: "ARJ21 飞控系统检查",
    steps: [
      {
        id: "step-1",
        name: "待复核",
        description: "维修工程师完成检查后提交复核",
        fields: ["aircraftType", "ataChapter", "checkArea", "checkItem", "defectDesc", "handling"],
        order: 1
      },
      {
        id: "step-2",
        name: "正常",
        description: "放行人员复核通过",
        fields: ["aircraftType", "ataChapter", "checkArea", "checkItem", "defectDesc", "handling", "signer"],
        order: 2
      },
      {
        id: "step-3",
        name: "缺陷",
        description: "存在缺陷需要处理",
        fields: ["aircraftType", "ataChapter", "checkArea", "checkItem", "defectDesc", "handling", "signer"],
        order: 3
      }
    ],
    fields: [
      {
        key: "aircraftType",
        label: "机型",
        type: "select",
        required: true,
        options: ["A320", "B737", "ARJ21"],
        placeholder: "选择机型"
      },
      {
        key: "ataChapter",
        label: "ATA章节",
        type: "select",
        required: true,
        options: ["ATA 21", "ATA 24", "ATA 27", "ATA 32", "ATA 33"],
        placeholder: "选择ATA章节"
      },
      {
        key: "checkArea",
        label: "检查区域",
        type: "select",
        required: true,
        options: ["机体", "动力装置", "航电", "起落架", "飞控", "电源系统"],
        placeholder: "选择检查区域"
      },
      {
        key: "checkItem",
        label: "检查项目",
        type: "text",
        required: false,
        placeholder: "填写检查项目"
      },
      {
        key: "status",
        label: "状态",
        type: "select",
        required: true,
        options: ["待复核", "正常", "缺陷"],
        placeholder: "选择状态"
      },
      {
        key: "defectDesc",
        label: "缺陷描述",
        type: "textarea",
        required: false,
        placeholder: "填写缺陷描述",
        fullWidth: true
      },
      {
        key: "handling",
        label: "处理意见",
        type: "textarea",
        required: false,
        placeholder: "填写处理意见",
        fullWidth: true
      },
      {
        key: "signer",
        label: "签署人",
        type: "text",
        required: false,
        placeholder: "填写签署人",
        fullWidth: true
      }
    ],
    statuses: ["待复核", "正常", "缺陷"],
    statusTransitions: [
      {
        from: "待复核",
        to: "正常",
        label: "通过复核",
        allowedRoles: ["放行人员"],
        colorClass: "pass-btn"
      },
      {
        from: "待复核",
        to: "缺陷",
        label: "标记缺陷",
        allowedRoles: ["放行人员", "维修工程师"],
        colorClass: "reject-btn"
      },
      {
        from: "缺陷",
        to: "正常",
        label: "修复完成",
        allowedRoles: ["放行人员"],
        requiredFields: ["handling"],
        colorClass: "pass-btn"
      },
      {
        from: "正常",
        to: "待复核",
        label: "重新复核",
        allowedRoles: ["培训教员", "放行人员"],
        colorClass: "reject-btn"
      }
    ],
    initialStatus: "待复核",
    metrics: [
      {
        key: "completionRate",
        label: "完成率",
        type: "percentage",
        source: "records",
        filter: { status: ["正常"] },
        colorIndex: 0
      },
      {
        key: "defectCount",
        label: "缺陷项",
        type: "count",
        source: "records",
        filter: { status: ["缺陷"] },
        colorIndex: 2
      },
      {
        key: "pendingReview",
        label: "待复核",
        type: "count",
        source: "records",
        filter: { status: ["待复核"] },
        colorIndex: 1
      },
      {
        key: "pendingDefects",
        label: "待处理缺陷",
        type: "count",
        source: "defects",
        filter: { status: ["pending", "processing"] },
        colorIndex: 1
      },
      {
        key: "ataChapters",
        label: "ATA章节",
        type: "count",
        source: "records",
        colorIndex: 0
      }
    ],
    filters: [
      {
        key: "flightControl",
        label: "飞控",
        type: "area",
        matchField: "checkArea"
      }
    ],
    rolePermissions: {
      "维修工程师": {
        canEdit: ["aircraftType", "ataChapter", "checkArea", "checkItem", "defectDesc", "handling", "status"],
        canView: true,
        canCreateDefect: true
      },
      "放行人员": {
        canEdit: ["status", "handling", "signer"],
        canView: true,
        canReview: true,
        canCreateDefect: true
      },
      "培训教员": {
        canEdit: [],
        canView: true
      }
    }
  }
];

export function getGlobalMetrics() {
  return [
    {
      key: "completionRate",
      label: "完成率",
      type: "percentage" as const,
      source: "records" as const,
      filter: { status: ["正常", "完成", "通过"] },
      colorIndex: 0
    },
    {
      key: "defectCount",
      label: "缺陷项",
      type: "count" as const,
      source: "records" as const,
      filter: { status: ["缺陷"] },
      colorIndex: 2
    },
    {
      key: "pendingReview",
      label: "待复核",
      type: "count" as const,
      source: "records" as const,
      filter: { status: ["待复核"] },
      colorIndex: 1
    },
    {
      key: "pendingDefects",
      label: "待处理缺陷",
      type: "count" as const,
      source: "defects" as const,
      filter: { status: ["pending", "processing"] },
      colorIndex: 1
    },
    {
      key: "ataChapters",
      label: "ATA章节",
      type: "distinctCount" as const,
      source: "records" as const,
      distinctField: "ataChapter",
      colorIndex: 0
    }
  ];
}

export function getGlobalFilters() {
  return [
    { key: "airframe", label: "机体", type: "area" as const, matchField: "checkArea" },
    { key: "powerplant", label: "动力装置", type: "area" as const, matchField: "checkArea" },
    { key: "avionics", label: "航电", type: "area" as const, matchField: "checkArea" },
    { key: "landingGear", label: "起落架", type: "area" as const, matchField: "checkArea" }
  ];
}

export function getGlobalFields() {
  return [
    { key: "aircraftType", label: "机型" },
    { key: "ataChapter", label: "ATA章节" },
    { key: "checkArea", label: "检查区域" },
    { key: "checkItem", label: "检查项目" },
    { key: "defectDesc", label: "缺陷描述" },
    { key: "handling", label: "处理意见" },
    { key: "signer", label: "签署人" }
  ];
}

export function getDemoRecords() {
  return [
    {
      id: "demo-1",
      aircraftType: "A320",
      ataChapter: "ATA 32",
      checkArea: "起落架",
      checkItem: "主轮磨损检查、减震支柱油位检查",
      status: "待复核",
      defectDesc: "主轮磨耗接近限制",
      handling: ""
    },
    {
      id: "demo-2",
      aircraftType: "B737",
      ataChapter: "ATA 24",
      checkArea: "电源系统",
      checkItem: "电瓶电压测试、APU发电机测试",
      status: "正常",
      defectDesc: "正常",
      handling: "正常"
    },
    {
      id: "demo-3",
      aircraftType: "ARJ21",
      ataChapter: "ATA 27",
      checkArea: "飞控",
      checkItem: "副翼作动测试、升降舵响应检查",
      status: "缺陷",
      defectDesc: "副翼作动测试需复查",
      handling: ""
    }
  ];
}
