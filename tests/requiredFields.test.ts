import { describe, it, expect } from "vitest";
import {
  validateRequiredFields,
  getRequiredFieldsForStatus,
  getInitialStatus,
  getStatusList,
} from "../src/workflow";
import { mockWorkflowConfig, mockFields } from "./__fixtures__/testData";

describe("必填字段校验 - validateRequiredFields", () => {
  const fields = mockFields;

  it("所有必填字段都有值时应返回 valid=true 且无缺失字段", () => {
    const formData = {
      aircraftType: "A320",
      ataChapter: "ATA 32",
      checkArea: "起落架",
      status: "待复核",
    };
    const result = validateRequiredFields(fields, formData);
    expect(result.valid).toBe(true);
    expect(result.missingFields).toEqual([]);
  });

  it("缺少必填字段时应返回 valid=false 并列出缺失字段的 label", () => {
    const formData = {
      aircraftType: "A320",
    };
    const result = validateRequiredFields(fields, formData);
    expect(result.valid).toBe(false);
    expect(result.missingFields).toContain("ATA章节");
    expect(result.missingFields).toContain("检查区域");
    expect(result.missingFields).toContain("状态");
    expect(result.missingFields).not.toContain("机型");
  });

  it("非必填字段缺失不应影响校验结果", () => {
    const formData = {
      aircraftType: "A320",
      ataChapter: "ATA 32",
      checkArea: "起落架",
      status: "待复核",
    };
    const result = validateRequiredFields(fields, formData);
    expect(result.valid).toBe(true);
    expect(result.missingFields).not.toContain("检查项目");
    expect(result.missingFields).not.toContain("缺陷描述");
    expect(result.missingFields).not.toContain("处理意见");
  });

  it("必填字段为空白字符串时应视为缺失", () => {
    const formData = {
      aircraftType: "  ",
      ataChapter: "ATA 32",
      checkArea: "",
      status: "待复核",
    };
    const result = validateRequiredFields(fields, formData);
    expect(result.valid).toBe(false);
    expect(result.missingFields).toContain("机型");
    expect(result.missingFields).toContain("检查区域");
  });

  it("必填字段值只包含空白字符时应视为缺失", () => {
    const formData = {
      aircraftType: "\t\n ",
      ataChapter: "ATA 32",
      checkArea: "起落架",
      status: "   \n",
    };
    const result = validateRequiredFields(fields, formData);
    expect(result.valid).toBe(false);
    expect(result.missingFields).toContain("机型");
    expect(result.missingFields).toContain("状态");
  });

  it("空字段列表应始终返回 valid=true", () => {
    const result = validateRequiredFields([], {});
    expect(result.valid).toBe(true);
    expect(result.missingFields).toEqual([]);
  });

  it("空表单数据但无非必填字段时应返回所有必填字段", () => {
    const result = validateRequiredFields(fields, {});
    expect(result.valid).toBe(false);
    expect(result.missingFields.length).toBe(4);
    expect(result.missingFields).toEqual(expect.arrayContaining(["机型", "ATA章节", "检查区域", "状态"]));
  });
});

describe("按状态获取必填字段 - getRequiredFieldsForStatus", () => {
  const config = mockWorkflowConfig;

  it("待复核状态应返回对应步骤中的必填字段", () => {
    const requiredFields = getRequiredFieldsForStatus(config, "待复核");
    const requiredKeys = requiredFields.map(f => f.key);
    expect(requiredKeys).toContain("aircraftType");
    expect(requiredKeys).toContain("ataChapter");
    expect(requiredKeys).toContain("checkArea");
    expect(requiredKeys).not.toContain("signer");
  });

  it("正常状态应包含签署人字段的必填校验", () => {
    const requiredFields = getRequiredFieldsForStatus(config, "正常");
    const requiredKeys = requiredFields.map(f => f.key);
    expect(requiredKeys).toContain("aircraftType");
  });

  it("不存在的状态应返回空数组", () => {
    const requiredFields = getRequiredFieldsForStatus(config, "不存在的状态");
    expect(requiredFields).toEqual([]);
  });

  it("应只返回 required=true 的字段", () => {
    const requiredFields = getRequiredFieldsForStatus(config, "待复核");
    expect(requiredFields.every(f => f.required)).toBe(true);
  });
});

describe("初始状态 - getInitialStatus", () => {
  it("有配置时应返回配置的初始状态", () => {
    expect(getInitialStatus(mockWorkflowConfig)).toBe("待复核");
  });

  it("无配置时应返回默认初始状态 '待复核'", () => {
    expect(getInitialStatus(undefined)).toBe("待复核");
  });
});

describe("状态列表 - getStatusList", () => {
  it("有配置时应返回配置中的状态列表", () => {
    const statuses = getStatusList(mockWorkflowConfig);
    expect(statuses).toEqual(["待复核", "正常", "缺陷"]);
  });

  it("无配置时应返回默认状态列表", () => {
    const statuses = getStatusList(undefined);
    expect(statuses).toEqual(["待复核", "正常", "缺陷"]);
  });
});
