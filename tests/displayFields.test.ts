import { describe, it, expect } from "vitest";
import {
  getRecordDisplayFields,
} from "../src/workflow";
import { mockWorkflowConfig, mockRecords } from "./__fixtures__/testData";

describe("记录展示字段回退逻辑 - getRecordDisplayFields", () => {
  it("有配置且记录字段齐全时应优先使用配置的字段", () => {
    const record = mockRecords[0];
    const fields = getRecordDisplayFields(mockWorkflowConfig, record);
    const labels = fields.map(f => f.label);

    expect(labels).toContain("机型");
    expect(labels).toContain("ATA章节");
    expect(labels).toContain("检查区域");
    expect(labels).toContain("检查项目");
    expect(labels).toContain("状态");
    expect(labels).toContain("处理意见");
    expect(labels).toContain("签署人");
  });

  it("有配置时应排除值为空的字段", () => {
    const record = {
      id: "test-1",
      aircraftType: "A320",
      ataChapter: "ATA 32",
      checkArea: "起落架",
      status: "待复核",
      defectDesc: "",
      handling: "",
      signer: "",
      checkItem: "",
    };
    const fields = getRecordDisplayFields(mockWorkflowConfig, record);
    const labels = fields.map(f => f.label);

    expect(labels).not.toContain("缺陷描述");
    expect(labels).not.toContain("处理意见");
    expect(labels).not.toContain("签署人");
    expect(labels).not.toContain("检查项目");
    expect(labels).toContain("机型");
  });

  it("有配置但值为 null 或 undefined 时应排除该字段", () => {
    const record: any = {
      id: "test-2",
      aircraftType: "A320",
      ataChapter: null,
      checkArea: undefined,
      status: "待复核",
    };
    const fields = getRecordDisplayFields(mockWorkflowConfig, record);
    const keys = fields.map(f => f.value);

    expect(keys).not.toContain(null);
    expect(keys).not.toContain(undefined as any);
    expect(fields.some(f => f.label === "机型")).toBe(true);
  });

  it("有配置时值只包含空白字符应排除该字段", () => {
    const record = {
      id: "test-3",
      aircraftType: "A320",
      ataChapter: "  ",
      checkArea: "\t\n",
      status: "待复核",
    };
    const fields = getRecordDisplayFields(mockWorkflowConfig, record);
    const labels = fields.map(f => f.label);

    expect(labels).not.toContain("ATA章节");
    expect(labels).not.toContain("检查区域");
  });

  it("无配置时应触发回退逻辑，按默认优先级展示字段", () => {
    const record = mockRecords[0];
    const fields = getRecordDisplayFields(undefined, record);
    const labels = fields.map(f => f.label);

    expect(labels).toContain("机型");
    expect(labels).toContain("ATA章节");
    expect(labels).toContain("检查区域");
    expect(labels.length).toBeGreaterThan(0);
  });

  it("回退逻辑应按优先级排序：基础字段在前", () => {
    const record = {
      id: "test-4",
      signer: "张工",
      aircraftType: "A320",
      remark: "备注信息",
      ataChapter: "ATA 32",
    };
    const fields = getRecordDisplayFields(undefined, record);
    const labels = fields.map(f => f.label);

    const aircraftIdx = labels.indexOf("机型");
    const ataIdx = labels.indexOf("ATA章节");
    const signerIdx = labels.indexOf("签署人");
    const remarkIdx = labels.indexOf("备注");

    expect(aircraftIdx).toBeLessThan(signerIdx);
    expect(ataIdx).toBeLessThan(signerIdx);
    if (remarkIdx >= 0) {
      expect(signerIdx).toBeLessThan(remarkIdx);
    }
  });

  it("回退逻辑应对未在默认标签映射中的字段使用 key 作为 label", () => {
    const record = {
      id: "test-5",
      aircraftType: "A320",
      customField: "自定义值",
    };
    const fields = getRecordDisplayFields(undefined, record);
    const customField = fields.find(f => f.value === "自定义值");
    expect(customField).toBeDefined();
    expect(customField?.label).toBe("customField");
  });

  it("应排除 id 字段", () => {
    const record = {
      id: "should-be-excluded",
      aircraftType: "A320",
    };
    const fields = getRecordDisplayFields(mockWorkflowConfig, record);
    const values = fields.map(f => f.value);
    expect(values).not.toContain("should-be-excluded");
  });

  it("应排除 workflowConfigId 字段", () => {
    const record = {
      id: "test-6",
      aircraftType: "A320",
      workflowConfigId: "config-123",
    };
    const fields = getRecordDisplayFields(mockWorkflowConfig, record);
    const values = fields.map(f => f.value);
    expect(values).not.toContain("config-123");
  });

  it("应排除以下划线开头的内部字段", () => {
    const record = {
      id: "test-7",
      aircraftType: "A320",
      _internal: "内部数据",
      _version: 1,
    };
    const fields = getRecordDisplayFields(mockWorkflowConfig, record);
    const values = fields.map(f => f.value);
    expect(values).not.toContain("内部数据");
    expect(values).not.toContain(1);
  });

  it("记录完全为空时应返回空数组", () => {
    const fields = getRecordDisplayFields(mockWorkflowConfig, {});
    expect(fields).toEqual([]);
  });

  it("记录只有空值字段时应返回空数组", () => {
    const record = {
      id: "test-8",
      aircraftType: "",
      ataChapter: "  ",
      defectDesc: null,
    };
    const fields = getRecordDisplayFields(mockWorkflowConfig, record);
    expect(fields).toEqual([]);
  });

  it("有配置但记录有额外非配置字段时，额外字段应在配置字段之后展示", () => {
    const record = {
      id: "test-9",
      aircraftType: "A320",
      ataChapter: "ATA 32",
      checkArea: "起落架",
      status: "正常",
      customExtra: "额外字段值",
    };
    const fields = getRecordDisplayFields(mockWorkflowConfig, record);
    const labels = fields.map(f => f.label);
    const extraIdx = labels.indexOf("customExtra");
    const aircraftIdx = labels.indexOf("机型");

    expect(extraIdx).toBeGreaterThan(aircraftIdx);
  });

  it("默认字段标签映射应正确工作", () => {
    const record = {
      id: "test-10",
      aircraftType: "A320",
      workOrder: "WO-2024-001",
      workType: "定期检修",
      inspector: "李检查员",
      date: "2024-01-15",
      note: "这是一条备注",
      description: "详细描述",
    };
    const fields = getRecordDisplayFields(undefined, record);
    const labels = fields.map(f => f.label);

    expect(labels).toContain("机型");
    expect(labels).toContain("工单号");
    expect(labels).toContain("工作类型");
    expect(labels).toContain("检查员");
    expect(labels).toContain("日期");
    expect(labels).toContain("备注");
    expect(labels).toContain("描述");
  });

  it("多条记录独立计算展示字段，互不影响", () => {
    const recordA = { id: "a", aircraftType: "A320", status: "正常" };
    const recordB = { id: "b", aircraftType: "B737", defectDesc: "有缺陷", status: "缺陷" };

    const fieldsA = getRecordDisplayFields(mockWorkflowConfig, recordA);
    const fieldsB = getRecordDisplayFields(mockWorkflowConfig, recordB);

    expect(fieldsA.map(f => f.label)).not.toContain("缺陷描述");
    expect(fieldsB.map(f => f.label)).toContain("缺陷描述");
  });
});
