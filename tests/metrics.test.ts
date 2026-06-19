import { describe, it, expect } from "vitest";
import {
  calculateMetricValue,
  getRoleSpecificMetrics,
  MetricConfig,
} from "../src/workflow";
import { mockRecords, mockDefects, mockReviews } from "./__fixtures__/testData";

describe("指标计算 - calculateMetricValue", () => {
  const defectsArray = Object.values(mockDefects);

  it("count 类型应返回正确的记录数量", () => {
    const metric: MetricConfig = {
      key: "totalRecords",
      label: "总记录数",
      type: "count",
      source: "records",
      colorIndex: 0,
    };
    expect(calculateMetricValue(metric, mockRecords, mockDefects, mockReviews)).toBe(String(mockRecords.length));
  });

  it("按状态过滤的 count 类型应返回正确数量", () => {
    const metric: MetricConfig = {
      key: "defectCount",
      label: "缺陷项",
      type: "count",
      source: "records",
      filter: { status: ["缺陷"] },
      colorIndex: 2,
    };
    const result = calculateMetricValue(metric, mockRecords, mockDefects, mockReviews);
    expect(result).toBe("1");
  });

  it("records 源按状态过滤时应使用 includes 模糊匹配", () => {
    const metric: MetricConfig = {
      key: "pendingCount",
      label: "待处理",
      type: "count",
      source: "records",
      filter: { status: ["待"] },
      colorIndex: 1,
    };
    const result = calculateMetricValue(metric, mockRecords, mockDefects, mockReviews);
    const expected = mockRecords.filter(r => r.status.includes("待")).length;
    expect(result).toBe(String(expected));
  });

  it("defects 源应从 defects 对象获取数据", () => {
    const metric: MetricConfig = {
      key: "totalDefects",
      label: "总缺陷数",
      type: "count",
      source: "defects",
      colorIndex: 0,
    };
    const result = calculateMetricValue(metric, mockRecords, mockDefects, mockReviews);
    expect(result).toBe(String(defectsArray.length));
  });

  it("defects 源按状态过滤时应精确匹配状态值", () => {
    const metric: MetricConfig = {
      key: "pendingDefects",
      label: "待处理缺陷",
      type: "count",
      source: "defects",
      filter: { status: ["pending", "processing"] },
      colorIndex: 1,
    };
    const result = calculateMetricValue(metric, mockRecords, mockDefects, mockReviews);
    const expected = defectsArray.filter(d => ["pending", "processing"].includes(d.status)).length;
    expect(result).toBe(String(expected));
  });

  it("reviews 源应从 reviews 对象获取数据", () => {
    const metric: MetricConfig = {
      key: "totalReviews",
      label: "总复核数",
      type: "count",
      source: "reviews",
      colorIndex: 0,
    };
    const result = calculateMetricValue(metric, mockRecords, mockDefects, mockReviews);
    expect(result).toBe(String(Object.keys(mockReviews).length));
  });

  it("按字段值过滤应正确工作", () => {
    const metric: MetricConfig = {
      key: "a320Records",
      label: "A320记录",
      type: "count",
      source: "records",
      filter: { field: "aircraftType", value: "A320" },
      colorIndex: 0,
    };
    const result = calculateMetricValue(metric, mockRecords, mockDefects, mockReviews);
    const expected = mockRecords.filter(r => r.aircraftType === "A320").length;
    expect(result).toBe(String(expected));
  });

  it("percentage 类型应正确计算百分比", () => {
    const metric: MetricConfig = {
      key: "completionRate",
      label: "完成率",
      type: "percentage",
      source: "records",
      filter: { status: ["正常"] },
      colorIndex: 0,
    };
    const result = calculateMetricValue(metric, mockRecords, mockDefects, mockReviews);
    const normalCount = mockRecords.filter(r => r.status.includes("正常")).length;
    const expected = Math.round((normalCount / mockRecords.length) * 100);
    expect(result).toBe(`${expected}%`);
  });

  it("percentage 类型在总数量为 0 时应返回 0%", () => {
    const metric: MetricConfig = {
      key: "completionRate",
      label: "完成率",
      type: "percentage",
      source: "records",
      filter: { status: ["正常"] },
      colorIndex: 0,
    };
    const result = calculateMetricValue(metric, [], mockDefects, mockReviews);
    expect(result).toBe("0%");
  });

  it("distinctCount 类型应按指定字段去重计数", () => {
    const metric: MetricConfig = {
      key: "ataChapters",
      label: "ATA章节数",
      type: "distinctCount",
      source: "records",
      distinctField: "ataChapter",
      colorIndex: 0,
    };
    const result = calculateMetricValue(metric, mockRecords, mockDefects, mockReviews);
    const uniqueChapters = new Set(mockRecords.map(r => r.ataChapter)).size;
    expect(result).toBe(String(uniqueChapters));
  });

  it("未知数据源应返回 0", () => {
    const metric = {
      key: "unknown",
      label: "未知",
      type: "count" as const,
      source: "unknown" as any,
      colorIndex: 0,
    };
    const result = calculateMetricValue(metric, mockRecords, mockDefects, mockReviews);
    expect(result).toBe("0");
  });

  it("未知指标类型应返回 0", () => {
    const metric = {
      key: "unknownType",
      label: "未知类型",
      type: "unknown" as any,
      source: "records" as const,
      colorIndex: 0,
    };
    const result = calculateMetricValue(metric, mockRecords, mockDefects, mockReviews);
    expect(result).toBe("0");
  });

  it("空数据时 count 类型应返回 0", () => {
    const metric: MetricConfig = {
      key: "totalRecords",
      label: "总记录数",
      type: "count",
      source: "records",
      colorIndex: 0,
    };
    expect(calculateMetricValue(metric, [], {}, {})).toBe("0");
  });
});

describe("角色特定指标 - getRoleSpecificMetrics", () => {
  const baseMetrics: MetricConfig[] = [
    { key: "completionRate", label: "完成率", type: "percentage", source: "records", filter: { status: ["正常"] }, colorIndex: 0 },
    { key: "defectCount", label: "缺陷项", type: "count", source: "records", filter: { status: ["缺陷"] }, colorIndex: 2 },
    { key: "pendingReview", label: "待复核", type: "count", source: "records", filter: { status: ["待复核"] }, colorIndex: 1 },
    { key: "pendingDefects", label: "处理中缺陷", type: "count", source: "defects", filter: { status: ["processing"] }, colorIndex: 1 },
  ];

  it("维修工程师应包含我的提交、待复核、缺陷项、处理中缺陷指标", () => {
    const metrics = getRoleSpecificMetrics(baseMetrics, "维修工程师");
    const keys = metrics.map(m => m.key);
    expect(keys).toContain("myRecords");
    expect(keys).toContain("pendingReview");
    expect(keys).toContain("defectCount");
    expect(keys).toContain("pendingDefects");
    expect(metrics.length).toBe(4);
  });

  it("放行人员应包含放行通过率、待复核、缺陷项、今日复核指标", () => {
    const metrics = getRoleSpecificMetrics(baseMetrics, "放行人员");
    const keys = metrics.map(m => m.key);
    expect(keys).toContain("completionRate");
    expect(keys).toContain("pendingReview");
    expect(keys).toContain("defectCount");
    expect(keys).toContain("reviewedToday");
    expect(metrics.length).toBe(4);
  });

  it("培训教员应包含整体完成率、缺陷项、已讲评、待讲评指标", () => {
    const metrics = getRoleSpecificMetrics(baseMetrics, "培训教员");
    const keys = metrics.map(m => m.key);
    expect(keys).toContain("completionRate");
    expect(keys).toContain("defectCount");
    expect(keys).toContain("commented");
    expect(keys).toContain("pendingComment");
    expect(metrics.length).toBe(4);
  });

  it("baseMetrics 缺失某项时应使用默认值", () => {
    const emptyBase: MetricConfig[] = [];
    const engineerMetrics = getRoleSpecificMetrics(emptyBase, "维修工程师");
    const keys = engineerMetrics.map(m => m.key);
    expect(keys).toContain("myRecords");
    expect(keys).toContain("pendingReview");
    expect(keys).toContain("defectCount");
    expect(keys).toContain("pendingDefects");
  });

  it("维修工程师的 myRecords 指标应为 count 类型", () => {
    const metrics = getRoleSpecificMetrics(baseMetrics, "维修工程师");
    const myRecords = metrics.find(m => m.key === "myRecords");
    expect(myRecords).toBeDefined();
    expect(myRecords?.type).toBe("count");
    expect(myRecords?.source).toBe("records");
  });

  it("放行人员的 reviewedToday 指标应来自 reviews 源", () => {
    const metrics = getRoleSpecificMetrics(baseMetrics, "放行人员");
    const reviewedToday = metrics.find(m => m.key === "reviewedToday");
    expect(reviewedToday).toBeDefined();
    expect(reviewedToday?.source).toBe("reviews");
  });
});
