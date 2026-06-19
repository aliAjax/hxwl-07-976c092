import { WorkflowConfig } from "./workflow";
import { workflowConfigs as builtInConfigs } from "./workflowConfigs";

const DB_NAME = "hxwl-07-aviation-maintenance";
const STORE_WORKFLOW_CONFIGS = "workflowConfigs";
const WORKFLOW_CONFIG_SEED_KEY = "hxwl-07-workflow-configs-seeded-v2";

export async function openWorkflowConfigDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

export async function ensureWorkflowConfigStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_WORKFLOW_CONFIGS)) {
        db.close();
        const upgradeRequest = indexedDB.open(DB_NAME, db.version + 1);
        upgradeRequest.onupgradeneeded = (event) => {
          const upgradeDb = (event.target as IDBOpenDBRequest).result;
          if (!upgradeDb.objectStoreNames.contains(STORE_WORKFLOW_CONFIGS)) {
            const store = upgradeDb.createObjectStore(STORE_WORKFLOW_CONFIGS, { keyPath: "id" });
            store.createIndex("aircraftType", "aircraftType", { unique: false });
            store.createIndex("ataChapter", "ataChapter", { unique: false });
            store.createIndex("checkArea", "checkArea", { unique: false });
          }
        };
        upgradeRequest.onsuccess = () => resolve(upgradeRequest.result);
        upgradeRequest.onerror = () => reject(upgradeRequest.error);
      } else {
        resolve(db);
      }
    };
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => Promise<T> | T
): Promise<T> {
  const db = await openWorkflowConfigDB();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE_WORKFLOW_CONFIGS, mode);
    const store = transaction.objectStore(STORE_WORKFLOW_CONFIGS);
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => reject(transaction.error);
    const result = callback(store);
    if (result instanceof Promise) {
      result.then(resolve).catch(reject);
    } else {
      resolve(result);
    }
  });
}

async function getAllStoredConfigs(): Promise<WorkflowConfig[]> {
  try {
    const db = await openWorkflowConfigDB();
    if (!db.objectStoreNames.contains(STORE_WORKFLOW_CONFIGS)) {
      db.close();
      return [];
    }
    return withStore("readonly", (store) => {
      return new Promise<WorkflowConfig[]>((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result as WorkflowConfig[]);
        request.onerror = () => reject(request.error);
      });
    });
  } catch {
    return [];
  }
}

export async function getAllWorkflowConfigs(): Promise<WorkflowConfig[]> {
  const stored = await getAllStoredConfigs();

  const builtInMap = new Map(builtInConfigs.map(c => [c.id, { ...c, _builtIn: true } as WorkflowConfig & { _builtIn?: boolean }]));
  const storedMap = new Map(stored.map(c => [c.id, c]));

  const mergedMap = new Map<string, WorkflowConfig>();

  builtInMap.forEach((config, id) => {
    mergedMap.set(id, config);
  });

  storedMap.forEach((config, id) => {
    mergedMap.set(id, config);
  });

  const result = Array.from(mergedMap.values());

  if (result.length === 0) {
    return [...builtInConfigs];
  }

  return result;
}

export async function getWorkflowConfigById(id: string): Promise<WorkflowConfig | undefined> {
  try {
    const stored = await withStore("readonly", (store) => {
      return new Promise<WorkflowConfig | undefined>((resolve, reject) => {
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result as WorkflowConfig | undefined);
        request.onerror = () => reject(request.error);
      });
    });
    if (stored) return stored;
  } catch {
    // ignore
  }
  return builtInConfigs.find(c => c.id === id);
}

export async function getWorkflowConfigByIdOrFallback(
  id: string,
  record?: Partial<{ aircraftType: string; ataChapter: string; checkArea: string; status: string }>
): Promise<{ config: WorkflowConfig; source: "exact" | "match" | "fallback" }> {
  const exact = await getWorkflowConfigById(id);
  if (exact) {
    return { config: exact, source: "exact" };
  }

  const allConfigs = await getAllWorkflowConfigs();

  if (record?.aircraftType && record?.ataChapter && record?.checkArea) {
    const matched = allConfigs.find(
      c => c.aircraftType === record.aircraftType &&
           c.ataChapter === record.ataChapter &&
           c.checkArea === record.checkArea
    );
    if (matched) {
      return { config: matched, source: "match" };
    }
  }

  const fallback = createFallbackConfig(
    record?.aircraftType || "未知机型",
    record?.ataChapter || "未知章节",
    record?.checkArea || "未知区域",
    record?.status
  );
  return { config: fallback, source: "fallback" };
}

export function createFallbackConfig(
  aircraftType: string,
  ataChapter: string,
  checkArea: string,
  recordStatus?: string
): WorkflowConfig {
  const defaultStatuses = ["待复核", "正常", "缺陷"];
  const statuses = recordStatus && !defaultStatuses.includes(recordStatus)
    ? Array.from(new Set([recordStatus, ...defaultStatuses]))
    : defaultStatuses;

  return {
    id: `fallback-${aircraftType}-${ataChapter}-${checkArea}`,
    aircraftType,
    ataChapter,
    checkArea,
    displayName: `${aircraftType} ${checkArea}检查（兼容模式）`,
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
      { key: "aircraftType", label: "机型", type: "select", required: true, options: [aircraftType], placeholder: "选择机型" },
      { key: "ataChapter", label: "ATA章节", type: "select", required: true, options: [ataChapter], placeholder: "选择ATA章节" },
      { key: "checkArea", label: "检查区域", type: "select", required: true, options: [checkArea], placeholder: "选择检查区域" },
      { key: "checkItem", label: "检查项目", type: "text", required: false, placeholder: "填写检查项目" },
      { key: "status", label: "状态", type: "select", required: true, options: statuses, placeholder: "选择状态" },
      { key: "defectDesc", label: "缺陷描述", type: "textarea", required: false, placeholder: "填写缺陷描述", fullWidth: true },
      { key: "handling", label: "处理意见", type: "textarea", required: false, placeholder: "填写处理意见", fullWidth: true },
      { key: "signer", label: "签署人", type: "text", required: false, placeholder: "填写签署人", fullWidth: true }
    ],
    statuses,
    statusTransitions: [
      { from: "待复核", to: "正常", label: "通过复核", allowedRoles: ["放行人员"], colorClass: "pass-btn" },
      { from: "待复核", to: "缺陷", label: "标记缺陷", allowedRoles: ["放行人员", "维修工程师"], colorClass: "reject-btn" },
      { from: "缺陷", to: "正常", label: "修复完成", allowedRoles: ["放行人员"], requiredFields: ["handling"], colorClass: "pass-btn" },
      { from: "正常", to: "待复核", label: "重新复核", allowedRoles: ["培训教员", "放行人员"], colorClass: "reject-btn" }
    ],
    initialStatus: "待复核",
    metrics: [
      { key: "completionRate", label: "完成率", type: "percentage", source: "records", filter: { status: ["正常"] }, colorIndex: 0 },
      { key: "defectCount", label: "缺陷项", type: "count", source: "records", filter: { status: ["缺陷"] }, colorIndex: 2 },
      { key: "pendingReview", label: "待复核", type: "count", source: "records", filter: { status: ["待复核"] }, colorIndex: 1 },
      { key: "pendingDefects", label: "待处理缺陷", type: "count", source: "defects", filter: { status: ["pending", "processing"] }, colorIndex: 1 },
      { key: "ataChapters", label: "ATA章节", type: "count", source: "records", colorIndex: 0 }
    ],
    filters: [
      { key: checkArea.toLowerCase().replace(/\s+/g, "-"), label: checkArea, type: "area", matchField: "checkArea" }
    ],
    rolePermissions: {
      "维修工程师": { canEdit: ["aircraftType", "ataChapter", "checkArea", "checkItem", "defectDesc", "handling", "status"], canView: true, canCreateDefect: true },
      "放行人员": { canEdit: ["status", "handling", "signer"], canView: true, canReview: true, canCreateDefect: true },
      "培训教员": { canEdit: [], canView: true }
    },
    _fallback: true
  } as WorkflowConfig & { _fallback?: boolean };
}

export async function saveWorkflowConfig(config: WorkflowConfig): Promise<void> {
  const db = await ensureWorkflowConfigStore();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_WORKFLOW_CONFIGS, "readwrite");
    const store = transaction.objectStore(STORE_WORKFLOW_CONFIGS);
    const saveConfig = { ...config, _updatedAt: Date.now() };
    const request = store.put(saveConfig);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

export async function deleteWorkflowConfig(id: string): Promise<void> {
  try {
    const db = await openWorkflowConfigDB();
    if (!db.objectStoreNames.contains(STORE_WORKFLOW_CONFIGS)) {
      db.close();
      return;
    }
    return withStore("readwrite", (store) => {
      return new Promise<void>((resolve, reject) => {
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    });
  } catch {
    return;
  }
}

export async function seedWorkflowConfigs(): Promise<void> {
  const isSeeded = localStorage.getItem(WORKFLOW_CONFIG_SEED_KEY);
  if (isSeeded === "true") return;

  const db = await ensureWorkflowConfigStore();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_WORKFLOW_CONFIGS, "readwrite");
    const store = transaction.objectStore(STORE_WORKFLOW_CONFIGS);
    builtInConfigs.forEach(config => {
      store.put({ ...config, _builtIn: true, _seededAt: Date.now() });
    });
    transaction.oncomplete = () => {
      localStorage.setItem(WORKFLOW_CONFIG_SEED_KEY, "true");
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

export async function resetWorkflowConfigsToDefault(): Promise<WorkflowConfig[]> {
  try {
    const db = await openWorkflowConfigDB();
    if (db.objectStoreNames.contains(STORE_WORKFLOW_CONFIGS)) {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_WORKFLOW_CONFIGS, "readwrite");
        const s = tx.objectStore(STORE_WORKFLOW_CONFIGS);
        s.clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    } else {
      db.close();
    }
  } catch {
    // ignore
  }
  localStorage.removeItem(WORKFLOW_CONFIG_SEED_KEY);
  await seedWorkflowConfigs();
  return getAllWorkflowConfigs();
}

export function generateConfigId(aircraftType: string, ataChapter: string, checkArea: string): string {
  const slug = `${aircraftType}-${ataChapter}-${checkArea}`.toLowerCase().replace(/\s+/g, "-");
  return `${slug}-${Date.now()}`;
}

export function createDefaultConfig(
  aircraftType: string,
  ataChapter: string,
  checkArea: string
): WorkflowConfig {
  const id = generateConfigId(aircraftType, ataChapter, checkArea);
  return {
    id,
    aircraftType,
    ataChapter,
    checkArea,
    displayName: `${aircraftType} ${checkArea}检查`,
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
      { key: "aircraftType", label: "机型", type: "select", required: true, options: [aircraftType], placeholder: "选择机型" },
      { key: "ataChapter", label: "ATA章节", type: "select", required: true, options: [ataChapter], placeholder: "选择ATA章节" },
      { key: "checkArea", label: "检查区域", type: "select", required: true, options: [checkArea], placeholder: "选择检查区域" },
      { key: "checkItem", label: "检查项目", type: "text", required: false, placeholder: "填写检查项目" },
      { key: "status", label: "状态", type: "select", required: true, options: ["待复核", "正常", "缺陷"], placeholder: "选择状态" },
      { key: "defectDesc", label: "缺陷描述", type: "textarea", required: false, placeholder: "填写缺陷描述", fullWidth: true },
      { key: "handling", label: "处理意见", type: "textarea", required: false, placeholder: "填写处理意见", fullWidth: true },
      { key: "signer", label: "签署人", type: "text", required: false, placeholder: "填写签署人", fullWidth: true }
    ],
    statuses: ["待复核", "正常", "缺陷"],
    statusTransitions: [
      { from: "待复核", to: "正常", label: "通过复核", allowedRoles: ["放行人员"], colorClass: "pass-btn" },
      { from: "待复核", to: "缺陷", label: "标记缺陷", allowedRoles: ["放行人员", "维修工程师"], colorClass: "reject-btn" },
      { from: "缺陷", to: "正常", label: "修复完成", allowedRoles: ["放行人员"], requiredFields: ["handling"], colorClass: "pass-btn" },
      { from: "正常", to: "待复核", label: "重新复核", allowedRoles: ["培训教员", "放行人员"], colorClass: "reject-btn" }
    ],
    initialStatus: "待复核",
    metrics: [
      { key: "completionRate", label: "完成率", type: "percentage", source: "records", filter: { status: ["正常"] }, colorIndex: 0 },
      { key: "defectCount", label: "缺陷项", type: "count", source: "records", filter: { status: ["缺陷"] }, colorIndex: 2 },
      { key: "pendingReview", label: "待复核", type: "count", source: "records", filter: { status: ["待复核"] }, colorIndex: 1 },
      { key: "pendingDefects", label: "待处理缺陷", type: "count", source: "defects", filter: { status: ["pending", "processing"] }, colorIndex: 1 },
      { key: "ataChapters", label: "ATA章节", type: "count", source: "records", colorIndex: 0 }
    ],
    filters: [
      { key: checkArea.toLowerCase().replace(/\s+/g, "-"), label: checkArea, type: "area", matchField: "checkArea" }
    ],
    rolePermissions: {
      "维修工程师": { canEdit: ["aircraftType", "ataChapter", "checkArea", "checkItem", "defectDesc", "handling", "status"], canView: true, canCreateDefect: true },
      "放行人员": { canEdit: ["status", "handling", "signer"], canView: true, canReview: true, canCreateDefect: true },
      "培训教员": { canEdit: [], canView: true }
    }
  };
}
