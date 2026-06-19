import { describe, it, expect } from "vitest";
import {
  getStatusCategory,
  getStatusBadgeClass,
  getDefectStatusBadgeClass,
  getDefectStatusText,
  getMatrixCellStatus,
  groupRecordsByStatus,
  StatusCategory,
} from "../src/workflow";
import { mockRecords } from "./__fixtures__/testData";

describe("状态分类 - getStatusCategory", () => {
  it("应将包含'正常'、'完成'、'通过'的状态归类为 normal", () => {
    expect(getStatusCategory("正常")).toBe("normal");
    expect(getStatusCategory("完成")).toBe("normal");
    expect(getStatusCategory("通过")).toBe("normal");
    expect(getStatusCategory("已完成")).toBe("normal");
    expect(getStatusCategory("复核通过")).toBe("normal");
  });

  it("应将包含'待复核'、'待'、'处理中'的状态归类为 pending", () => {
    expect(getStatusCategory("待复核")).toBe("pending");
    expect(getStatusCategory("待处理")).toBe("pending");
    expect(getStatusCategory("处理中")).toBe("pending");
    expect(getStatusCategory("待审核")).toBe("pending");
  });

  it("应将包含'缺陷'、'驳回'、'退回'的状态归类为 defect", () => {
    expect(getStatusCategory("缺陷")).toBe("defect");
    expect(getStatusCategory("已缺陷")).toBe("defect");
    expect(getStatusCategory("驳回")).toBe("defect");
    expect(getStatusCategory("已退回")).toBe("defect");
  });

  it("应将不匹配任何关键词的未知状态默认归类为 normal", () => {
    expect(getStatusCategory("未知状态")).toBe("normal");
    expect(getStatusCategory("其他")).toBe("normal");
    expect(getStatusCategory("")).toBe("normal");
  });

  it("状态分类应不区分大小写", () => {
    expect(getStatusCategory("NORMAL")).toBe("normal");
    expect(getStatusCategory("PENDING待处理")).toBe("pending");
    expect(getStatusCategory("DEFECT缺陷")).toBe("defect");
  });
});

describe("状态徽章样式 - getStatusBadgeClass", () => {
  it("正常状态应返回 status-badge-ok", () => {
    expect(getStatusBadgeClass("正常")).toBe("status-badge-ok");
    expect(getStatusBadgeClass("完成")).toBe("status-badge-ok");
    expect(getStatusBadgeClass("通过")).toBe("status-badge-ok");
  });

  it("待处理状态应返回 status-badge-watch", () => {
    expect(getStatusBadgeClass("待复核")).toBe("status-badge-watch");
    expect(getStatusBadgeClass("处理中")).toBe("status-badge-watch");
  });

  it("缺陷状态应返回 status-badge-danger", () => {
    expect(getStatusBadgeClass("缺陷")).toBe("status-badge-danger");
    expect(getStatusBadgeClass("驳回")).toBe("status-badge-danger");
    expect(getStatusBadgeClass("退回")).toBe("status-badge-danger");
  });

  it("未知状态应返回默认样式 status-badge-default", () => {
    expect(getStatusBadgeClass("未知")).toBe("status-badge-default");
  });
});

describe("缺陷状态徽章 - getDefectStatusBadgeClass", () => {
  it("各缺陷状态应返回对应的徽章样式", () => {
    expect(getDefectStatusBadgeClass("pending")).toBe("defect-status-badge-pending");
    expect(getDefectStatusBadgeClass("processing")).toBe("defect-status-badge-processing");
    expect(getDefectStatusBadgeClass("completed")).toBe("defect-status-badge-completed");
    expect(getDefectStatusBadgeClass("rejected")).toBe("defect-status-badge-rejected");
  });

  it("未知缺陷状态应默认为 pending 样式", () => {
    expect(getDefectStatusBadgeClass("unknown")).toBe("defect-status-badge-pending");
    expect(getDefectStatusBadgeClass("")).toBe("defect-status-badge-pending");
  });
});

describe("缺陷状态文本 - getDefectStatusText", () => {
  it("各缺陷状态应返回对应的中文描述", () => {
    expect(getDefectStatusText("pending")).toBe("待处理");
    expect(getDefectStatusText("processing")).toBe("处理中");
    expect(getDefectStatusText("completed")).toBe("已完成");
    expect(getDefectStatusText("rejected")).toBe("已退回");
  });

  it("未知状态应原样返回", () => {
    expect(getDefectStatusText("custom_status")).toBe("custom_status");
  });
});

describe("矩阵单元格状态 - getMatrixCellStatus", () => {
  it("无记录时应返回 not-started", () => {
    expect(getMatrixCellStatus([], ["待复核", "正常", "缺陷"])).toBe("not-started");
  });

  it("存在缺陷记录时应优先返回 defect", () => {
    const records = [
      { status: "正常" },
      { status: "缺陷" },
      { status: "待复核" },
    ];
    expect(getMatrixCellStatus(records, ["待复核", "正常", "缺陷"])).toBe("defect");
  });

  it("无缺陷但有待处理记录时应返回 pending", () => {
    const records = [
      { status: "正常" },
      { status: "待复核" },
    ];
    expect(getMatrixCellStatus(records, ["待复核", "正常", "缺陷"])).toBe("pending");
  });

  it("全部为正常记录时应返回 normal", () => {
    const records = [
      { status: "正常" },
      { status: "完成" },
    ];
    expect(getMatrixCellStatus(records, ["待复核", "正常", "缺陷"])).toBe("normal");
  });

  it("记录状态不在可选状态列表中时不应影响判定", () => {
    const records = [
      { status: "已归档" },
      { status: "正常" },
    ];
    expect(getMatrixCellStatus(records, ["待复核", "正常", "缺陷"])).toBe("normal");
  });
});

describe("按状态分组记录 - groupRecordsByStatus", () => {
  it("应将记录按状态分类正确分组", () => {
    const groups = groupRecordsByStatus(mockRecords, ["待复核", "正常", "缺陷"]);

    expect(groups.normal.length).toBe(2);
    expect(groups.normal.every((r: any) => getStatusCategory(r.status) === "normal")).toBe(true);

    expect(groups.pending.length).toBe(1);
    expect(groups.pending[0].status).toBe("待复核");

    expect(groups.defect.length).toBe(1);
    expect(groups.defect[0].status).toBe("缺陷");
  });

  it("空记录应返回空分组", () => {
    const groups = groupRecordsByStatus([], ["待复核", "正常", "缺陷"]);
    expect(groups.normal).toEqual([]);
    expect(groups.pending).toEqual([]);
    expect(groups.defect).toEqual([]);
  });

  it("分组对象应始终包含三个分类键", () => {
    const groups = groupRecordsByStatus(mockRecords, ["待复核", "正常", "缺陷"]);
    const keys = Object.keys(groups) as StatusCategory[];
    expect(keys).toContain("normal");
    expect(keys).toContain("pending");
    expect(keys).toContain("defect");
  });
});
