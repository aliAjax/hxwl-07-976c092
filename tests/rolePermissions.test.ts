import { describe, it, expect } from "vitest";
import {
  canRoleEditField,
  getRoleVisibleFields,
  getRoleEditableFields,
  canRolePerformAction,
  getRoleDescription,
  getAvailableStatusTransitions,
  canCreateDefect,
  UserRole,
} from "../src/workflow";
import { mockWorkflowConfig } from "./__fixtures__/testData";

describe("角色字段编辑权限 - canRoleEditField", () => {
  const config = mockWorkflowConfig;

  it("维修工程师应能编辑基础字段", () => {
    expect(canRoleEditField(config, "aircraftType", "维修工程师")).toBe(true);
    expect(canRoleEditField(config, "ataChapter", "维修工程师")).toBe(true);
    expect(canRoleEditField(config, "checkArea", "维修工程师")).toBe(true);
    expect(canRoleEditField(config, "checkItem", "维修工程师")).toBe(true);
    expect(canRoleEditField(config, "defectDesc", "维修工程师")).toBe(true);
    expect(canRoleEditField(config, "handling", "维修工程师")).toBe(true);
    expect(canRoleEditField(config, "status", "维修工程师")).toBe(true);
  });

  it("维修工程师不应能编辑签署人字段", () => {
    expect(canRoleEditField(config, "signer", "维修工程师")).toBe(false);
  });

  it("放行人员应能编辑状态、处理意见和签署人", () => {
    expect(canRoleEditField(config, "status", "放行人员")).toBe(true);
    expect(canRoleEditField(config, "handling", "放行人员")).toBe(true);
    expect(canRoleEditField(config, "signer", "放行人员")).toBe(true);
  });

  it("放行人员不应能编辑基础检查字段", () => {
    expect(canRoleEditField(config, "aircraftType", "放行人员")).toBe(false);
    expect(canRoleEditField(config, "ataChapter", "放行人员")).toBe(false);
    expect(canRoleEditField(config, "checkArea", "放行人员")).toBe(false);
    expect(canRoleEditField(config, "checkItem", "放行人员")).toBe(false);
  });

  it("培训教员不应能编辑任何字段", () => {
    expect(canRoleEditField(config, "aircraftType", "培训教员")).toBe(false);
    expect(canRoleEditField(config, "status", "培训教员")).toBe(false);
    expect(canRoleEditField(config, "signer", "培训教员")).toBe(false);
  });

  it("编辑不存在的字段应返回 false", () => {
    expect(canRoleEditField(config, "nonexistentField", "维修工程师")).toBe(false);
  });
});

describe("角色可见字段 - getRoleVisibleFields", () => {
  it("有配置时所有角色默认应能查看所有字段", () => {
    const engineerFields = getRoleVisibleFields(mockWorkflowConfig, "维修工程师");
    const releaserFields = getRoleVisibleFields(mockWorkflowConfig, "放行人员");
    const trainerFields = getRoleVisibleFields(mockWorkflowConfig, "培训教员");

    expect(engineerFields.length).toBeGreaterThan(0);
    expect(releaserFields.length).toBeGreaterThan(0);
    expect(trainerFields.length).toBeGreaterThan(0);
  });

  it("无配置时应返回默认字段集", () => {
    const defaultFields = getRoleVisibleFields(undefined, "维修工程师");
    expect(defaultFields.length).toBeGreaterThan(0);
    expect(defaultFields.some(f => f.key === "aircraftType")).toBe(true);
    expect(defaultFields.some(f => f.key === "ataChapter")).toBe(true);
    expect(defaultFields.some(f => f.key === "checkArea")).toBe(true);
  });

  it("无配置时放行人员额外可见签署人字段", () => {
    const releaserFields = getRoleVisibleFields(undefined, "放行人员");
    expect(releaserFields.some(f => f.key === "signer")).toBe(true);
  });
});

describe("角色可编辑字段列表 - getRoleEditableFields", () => {
  const config = mockWorkflowConfig;

  it("有配置时应返回配置中定义的可编辑字段", () => {
    const engineerEditable = getRoleEditableFields(config, "维修工程师");
    expect(engineerEditable).toEqual(expect.arrayContaining(["aircraftType", "ataChapter", "checkArea"]));
    expect(engineerEditable).not.toContain("signer");

    const releaserEditable = getRoleEditableFields(config, "放行人员");
    expect(releaserEditable).toEqual(["status", "handling", "signer"]);

    const trainerEditable = getRoleEditableFields(config, "培训教员");
    expect(trainerEditable).toEqual([]);
  });

  it("无配置时应返回默认的可编辑字段", () => {
    const engineerEditable = getRoleEditableFields(undefined, "维修工程师");
    expect(engineerEditable).toContain("aircraftType");
    expect(engineerEditable).toContain("status");
    expect(engineerEditable).not.toContain("signer");

    const releaserEditable = getRoleEditableFields(undefined, "放行人员");
    expect(releaserEditable).toContain("status");
    expect(releaserEditable).toContain("signer");

    const trainerEditable = getRoleEditableFields(undefined, "培训教员");
    expect(trainerEditable).toEqual([]);
  });
});

describe("角色操作权限 - canRolePerformAction", () => {
  const config = mockWorkflowConfig;
  const roles: UserRole[] = ["维修工程师", "放行人员", "培训教员"];

  it("维修工程师应能创建和编辑记录、创建缺陷，不应能复核", () => {
    expect(canRolePerformAction(config, "维修工程师", "create")).toBe(true);
    expect(canRolePerformAction(config, "维修工程师", "edit")).toBe(true);
    expect(canRolePerformAction(config, "维修工程师", "createDefect")).toBe(true);
    expect(canRolePerformAction(config, "维修工程师", "review")).toBe(false);
  });

  it("放行人员应能编辑、复核、创建缺陷", () => {
    expect(canRolePerformAction(config, "放行人员", "edit")).toBe(true);
    expect(canRolePerformAction(config, "放行人员", "review")).toBe(true);
    expect(canRolePerformAction(config, "放行人员", "createDefect")).toBe(true);
  });

  it("培训教员只能添加讲评，不能执行其他操作", () => {
    expect(canRolePerformAction(config, "培训教员", "addComment")).toBe(true);
    expect(canRolePerformAction(config, "培训教员", "edit")).toBe(false);
    expect(canRolePerformAction(config, "培训教员", "review")).toBe(false);
    expect(canRolePerformAction(config, "培训教员", "createDefect")).toBe(false);
  });

  it("addComment 操作仅限培训教员", () => {
    expect(canRolePerformAction(config, "培训教员", "addComment")).toBe(true);
    expect(canRolePerformAction(config, "维修工程师", "addComment")).toBe(false);
    expect(canRolePerformAction(config, "放行人员", "addComment")).toBe(false);
  });

  it("无配置时应使用默认权限规则", () => {
    expect(canRolePerformAction(undefined, "维修工程师", "create")).toBe(true);
    expect(canRolePerformAction(undefined, "放行人员", "review")).toBe(true);
    expect(canRolePerformAction(undefined, "培训教员", "addComment")).toBe(true);
  });
});

describe("角色描述 - getRoleDescription", () => {
  it("各角色应返回正确的中文描述", () => {
    expect(getRoleDescription("维修工程师")).toContain("提交检查记录");
    expect(getRoleDescription("放行人员")).toContain("复核检查记录");
    expect(getRoleDescription("培训教员")).toContain("培训讲评");
  });
});

describe("状态转换权限 - getAvailableStatusTransitions", () => {
  const config = mockWorkflowConfig;

  it("放行人员从待复核状态应可转换到正常和缺陷", () => {
    const transitions = getAvailableStatusTransitions(config, "待复核", "放行人员");
    const targets = transitions.map(t => t.to);
    expect(targets).toContain("正常");
    expect(targets).toContain("缺陷");
  });

  it("维修工程师从待复核状态只能标记缺陷，不能通过复核", () => {
    const transitions = getAvailableStatusTransitions(config, "待复核", "维修工程师");
    const targets = transitions.map(t => t.to);
    expect(targets).toContain("缺陷");
    expect(targets).not.toContain("正常");
  });

  it("培训教员不能直接从待复核转换状态", () => {
    const transitions = getAvailableStatusTransitions(config, "待复核", "培训教员");
    expect(transitions).toEqual([]);
  });

  it("放行人员从缺陷状态可转换到正常（修复完成）", () => {
    const transitions = getAvailableStatusTransitions(config, "缺陷", "放行人员");
    const targets = transitions.map(t => t.to);
    expect(targets).toContain("正常");
  });

  it("培训教员和放行人员可从正常状态重新复核", () => {
    const trainerTransitions = getAvailableStatusTransitions(config, "正常", "培训教员");
    const releaserTransitions = getAvailableStatusTransitions(config, "正常", "放行人员");

    expect(trainerTransitions.map(t => t.to)).toContain("待复核");
    expect(releaserTransitions.map(t => t.to)).toContain("待复核");
  });

  it("维修工程师不能从正常状态重新复核", () => {
    const transitions = getAvailableStatusTransitions(config, "正常", "维修工程师");
    expect(transitions).toEqual([]);
  });

  it("从不存在的状态转换应返回空数组", () => {
    const transitions = getAvailableStatusTransitions(config, "未知状态", "放行人员");
    expect(transitions).toEqual([]);
  });
});

describe("创建缺陷权限 - canCreateDefect", () => {
  const config = mockWorkflowConfig;

  it("维修工程师和放行人员在缺陷状态下应能创建缺陷项", () => {
    expect(canCreateDefect(config, "维修工程师", "缺陷")).toBe(true);
    expect(canCreateDefect(config, "放行人员", "缺陷")).toBe(true);
  });

  it("培训教员不能创建缺陷项", () => {
    expect(canCreateDefect(config, "培训教员", "缺陷")).toBe(false);
  });

  it("非缺陷状态下不能创建缺陷项", () => {
    expect(canCreateDefect(config, "维修工程师", "待复核")).toBe(false);
    expect(canCreateDefect(config, "放行人员", "正常")).toBe(false);
  });

  it("无配置时维修工程师在缺陷状态下应能创建缺陷", () => {
    expect(canCreateDefect(undefined, "维修工程师", "缺陷")).toBe(true);
    expect(canCreateDefect(undefined, "放行人员", "缺陷")).toBe(false);
  });
});
