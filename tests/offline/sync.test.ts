// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  detectConflict,
  calculateContentHash,
  addVersionFields,
  isOperationProcessed,
  markOperationProcessed,
  generateOperationId,
  getEntityTypeLabel,
  initSync,
} from "../../src/sync";

describe("同步逻辑 - calculateContentHash", () => {
  it("相同内容应生成相同哈希值", () => {
    const entity1 = { id: "1", name: "test", value: 42 };
    const entity2 = { id: "1", name: "test", value: 42 };

    const hash1 = calculateContentHash(entity1);
    const hash2 = calculateContentHash(entity2);

    expect(hash1).toBe(hash2);
  });

  it("不同内容应生成不同哈希值", () => {
    const entity1 = { id: "1", name: "test" };
    const entity2 = { id: "1", name: "different" };

    const hash1 = calculateContentHash(entity1);
    const hash2 = calculateContentHash(entity2);

    expect(hash1).not.toBe(hash2);
  });

  it("应排除版本字段计算哈希", () => {
    const entity1 = { id: "1", name: "test", _version: 1, _updatedAt: 1000 };
    const entity2 = { id: "1", name: "test", _version: 2, _updatedAt: 2000 };

    const hash1 = calculateContentHash(entity1);
    const hash2 = calculateContentHash(entity2);

    expect(hash1).toBe(hash2);
  });

  it("应排除操作ID和内容哈希字段", () => {
    const entity1 = { id: "1", name: "test", _operationId: "op-1", _contentHash: "abc" };
    const entity2 = { id: "1", name: "test", _operationId: "op-2", _contentHash: "xyz" };

    const hash1 = calculateContentHash(entity1);
    const hash2 = calculateContentHash(entity2);

    expect(hash1).toBe(hash2);
  });

  it("字段顺序不影响哈希结果", () => {
    const entity1 = { id: "1", name: "test", value: 42 };
    const entity2 = { value: 42, id: "1", name: "test" } as any;

    const hash1 = calculateContentHash(entity1);
    const hash2 = calculateContentHash(entity2);

    expect(hash1).toBe(hash2);
  });

  it("空对象也应生成有效哈希", () => {
    const hash = calculateContentHash({});
    expect(hash).toBeDefined();
    expect(typeof hash).toBe("string");
    expect(hash.length).toBeGreaterThan(0);
  });
});

describe("同步逻辑 - addVersionFields", () => {
  it("应添加版本、更新时间和内容哈希字段", () => {
    const entity = { id: "test-1", name: "测试记录" };

    const versioned = addVersionFields(entity);

    expect(versioned._version).toBe(1);
    expect(versioned._updatedAt).toBeGreaterThan(0);
    expect(versioned._contentHash).toBeDefined();
    expect(versioned.id).toBe("test-1");
    expect(versioned.name).toBe("测试记录");
  });

  it("应基于现有版本号递增", () => {
    const entity = { id: "test-1", name: "测试记录" };

    const versioned1 = addVersionFields(entity);
    expect(versioned1._version).toBe(1);

    const versioned2 = addVersionFields(entity, versioned1._version);
    expect(versioned2._version).toBe(2);
  });

  it("应在提供操作ID时保存操作ID", () => {
    const entity = { id: "test-1" };
    const opId = "op-12345";

    const versioned = addVersionFields(entity, 0, opId);

    expect(versioned._operationId).toBe(opId);
  });

  it("内容哈希应与数据一致", () => {
    const entity = { id: "test-1", status: "待复核" };

    const versioned = addVersionFields(entity);
    const expectedHash = calculateContentHash(entity);

    expect(versioned._contentHash).toBe(expectedHash);
  });
});

describe("同步逻辑 - detectConflict", () => {
  const baseEntity = {
    id: "rec-1",
    aircraftType: "A320",
    status: "待复核",
    _version: 1,
    _updatedAt: 1000,
    _contentHash: "",
  };

  beforeEach(() => {
    baseEntity._contentHash = calculateContentHash(baseEntity);
  });

  it("ID不同时不应检测为冲突", () => {
    const local = { ...baseEntity, id: "local-1" };
    const remote = { ...baseEntity, id: "remote-1" };

    const conflict = detectConflict(local as any, remote as any);
    expect(conflict).toBeNull();
  });

  it("相同内容哈希不应检测为冲突", () => {
    const local = { ...baseEntity, _version: 2, _updatedAt: 2000 };
    const remote = { ...baseEntity, _version: 2, _updatedAt: 2000 };
    local._contentHash = calculateContentHash(local);
    remote._contentHash = calculateContentHash(remote);

    const conflict = detectConflict(local as any, remote as any);
    expect(conflict).toBeNull();
  });

  it("相同操作ID不应检测为冲突（幂等）", () => {
    const local = { ...baseEntity, _operationId: "op-abc" };
    const remote = { ...baseEntity, _operationId: "op-abc", status: "正常" };

    const conflict = detectConflict(local as any, remote as any);
    expect(conflict).toBeNull();
  });

  it("远程版本更低且时间更早不应检测为冲突", () => {
    const local = { ...baseEntity, _version: 3, _updatedAt: 3000, status: "正常" };
    const remote = { ...baseEntity, _version: 1, _updatedAt: 1000, status: "待复核" };
    local._contentHash = calculateContentHash(local);
    remote._contentHash = calculateContentHash(remote);

    const conflict = detectConflict(local as any, remote as any);
    expect(conflict).toBeNull();
  });

  it("远程版本更高且内容不同应检测为冲突", () => {
    const local = { ...baseEntity, _version: 1, _updatedAt: 1000, status: "待复核" };
    const remote = { ...baseEntity, _version: 2, _updatedAt: 2000, status: "正常" };
    local._contentHash = calculateContentHash(local);
    remote._contentHash = calculateContentHash(remote);

    const conflict = detectConflict(local as any, remote as any);

    expect(conflict).not.toBeNull();
    expect(conflict?.entityId).toBe("rec-1");
    expect(conflict?.resolved).toBe(false);
    expect(conflict?.localChanges).toBeDefined();
    expect(conflict?.remoteChanges).toBeDefined();
    expect(Object.keys(conflict!.localChanges).length).toBeGreaterThan(0);
  });

  it("应正确识别缺陷实体类型", () => {
    const local = {
      id: "def-1",
      sourceRecordId: "rec-1",
      status: "pending",
      _version: 1,
      _updatedAt: 1000,
      _contentHash: "hash1",
    };
    const remote = {
      id: "def-1",
      sourceRecordId: "rec-1",
      status: "processing",
      _version: 2,
      _updatedAt: 2000,
      _contentHash: "hash2",
    };

    const conflict = detectConflict(local as any, remote as any);
    expect(conflict?.entityType).toBe("defect");
  });

  it("应正确识别培训讲评实体类型", () => {
    const local = {
      id: "tc-1",
      recordId: "rec-1",
      comment: "",
      status: "待讲评",
      _version: 1,
      _updatedAt: 1000,
      _contentHash: "hash1",
    };
    const remote = {
      id: "tc-1",
      recordId: "rec-1",
      comment: "做得好",
      status: "已讲评",
      _version: 2,
      _updatedAt: 2000,
      _contentHash: "hash2",
    };

    const conflict = detectConflict(local as any, remote as any);
    expect(conflict?.entityType).toBe("trainingComment");
  });

  it("应正确识别状态历史实体类型", () => {
    const local = {
      id: "sh-1",
      recordId: "rec-1",
      fromStatus: "待复核",
      toStatus: "正常",
      _version: 1,
      _updatedAt: 1000,
      _contentHash: "hash1",
    };
    const remote = {
      id: "sh-1",
      recordId: "rec-1",
      fromStatus: "待复核",
      toStatus: "缺陷",
      _version: 2,
      _updatedAt: 2000,
      _contentHash: "hash2",
    };

    const conflict = detectConflict(local as any, remote as any);
    expect(conflict?.entityType).toBe("statusHistory");
  });

  it("应包含本地和远程的变更详情", () => {
    const local = { ...baseEntity, status: "待复核", defectDesc: "", _version: 1, _updatedAt: 1000 };
    const remote = { ...baseEntity, status: "缺陷", defectDesc: "发现裂缝", _version: 2, _updatedAt: 2000 };
    local._contentHash = calculateContentHash(local);
    remote._contentHash = calculateContentHash(remote);

    const conflict = detectConflict(local as any, remote as any);

    expect(conflict?.localChanges.status).toBeDefined();
    expect(conflict?.localChanges.defectDesc).toBeDefined();
    expect(conflict?.localChanges.status?.old).toBe("待复核");
    expect(conflict?.localChanges.status?.new).toBe("缺陷");
    expect(conflict?.localChanges.defectDesc?.new).toBe("发现裂缝");

    expect(conflict?.remoteChanges.status).toBeDefined();
    expect(conflict?.remoteChanges.status?.old).toBe("缺陷");
    expect(conflict?.remoteChanges.status?.new).toBe("待复核");
  });
});

describe("同步逻辑 - 操作处理追踪", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("generateOperationId 应生成唯一ID", () => {
    const id1 = generateOperationId();
    const id2 = generateOperationId();

    expect(id1).toBeDefined();
    expect(id2).toBeDefined();
    expect(id1).not.toBe(id2);
    expect(id1.startsWith("op-")).toBe(true);
  });

  it("isOperationProcessed 应对未处理操作返回 false", () => {
    expect(isOperationProcessed("unknown-op")).toBe(false);
  });

  it("markOperationProcessed 和 isOperationProcessed 应协同工作", () => {
    const opId = "test-op-123";

    expect(isOperationProcessed(opId)).toBe(false);
    markOperationProcessed(opId);
    expect(isOperationProcessed(opId)).toBe(true);
  });

  it("空操作ID不应被标记为已处理", () => {
    markOperationProcessed("");
    expect(isOperationProcessed("")).toBe(false);
  });
});

describe("同步逻辑 - 实体类型标签", () => {
  it("getEntityTypeLabel 应返回正确的中文标签", () => {
    expect(getEntityTypeLabel("record")).toBe("检查记录");
    expect(getEntityTypeLabel("defect")).toBe("缺陷");
    expect(getEntityTypeLabel("trainingComment")).toBe("讲评备注");
    expect(getEntityTypeLabel("statusHistory")).toBe("状态历史");
  });
});

describe("同步逻辑 - initSync", () => {
  it("initSync 应返回清理函数", () => {
    const cleanup = initSync();
    expect(typeof cleanup).toBe("function");
  });
});
