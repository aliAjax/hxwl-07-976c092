import {
  enqueueOperation,
  cacheStaticAssets
} from "./offline";

export interface CheckTemplate {
  id: string;
  name: string;
  aircraftType: string;
  ataChapter: string;
  checkArea: string;
  checkItem: string;
  defectDesc: string;
  handling: string;
  signer: string;
}

export interface ReviewRecord {
  id: string;
  aircraftType: string;
  ataChapter: string;
  checkArea: string;
  checkItem?: string;
  status: string;
  defectDesc: string;
  handling: string;
  workflowConfigId?: string;
}

export interface ReviewNote {
  recordId: string;
  note: string;
}

export type ReviewState = Record<string, string>;

export type ReleaseReviewStatus = "pending" | "passed" | "rejected";

export interface ReleaseReviewResult {
  recordId: string;
  status: ReleaseReviewStatus;
  opinion: string;
  reviewer: string;
  reviewedAt: number;
}

export type ReleaseReviewState = Record<string, ReleaseReviewResult>;

export type DefectStatus = "pending" | "processing" | "completed" | "rejected";

export type DefectPriority = "low" | "medium" | "high" | "critical";

export interface DefectItem {
  id: string;
  sourceRecordId: string;
  aircraftType: string;
  ataChapter: string;
  checkArea: string;
  checkItem?: string;
  defectDesc: string;
  handlingOpinion: string;
  assignedSigner: string;
  status: DefectStatus;
  priority: DefectPriority;
  expectedCompletionTime?: number;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  rejectedAt?: number;
  rejectedReason?: string;
  completedNote?: string;
}

export type DefectState = Record<string, DefectItem>;

export type UserRole = "维修工程师" | "放行人员" | "培训教员";

export type TrainingCommentStatus = "待讲评" | "需复训" | "已闭环";

export interface StatusHistoryItem {
  id: string;
  recordId: string;
  fromStatus: string;
  toStatus: string;
  operatorRole: UserRole;
  operatorName: string;
  changedAt: number;
  remark?: string;
  fieldChanges?: Record<string, { oldValue: string; newValue: string }>;
}

export type StatusHistoryState = Record<string, StatusHistoryItem[]>;

export interface TrainingComment {
  id: string;
  recordId: string;
  comment: string;
  trainer: string;
  status: TrainingCommentStatus;
  createdAt: number;
  updatedAt: number;
}

export type TrainingCommentState = Record<string, TrainingComment>;

const DB_NAME = "hxwl-07-aviation-maintenance";
const DB_VERSION = 7;

const STORE_TEMPLATES = "templates";
const STORE_RECORDS = "records";
const STORE_REVIEW_NOTES = "reviewNotes";
const STORE_RELEASE_REVIEWS = "releaseReviews";
const STORE_DEFECTS = "defects";
const STORE_STATUS_HISTORY = "statusHistory";
const STORE_TRAINING_COMMENTS = "trainingComments";

const SEED_KEY = "hxwl-07-seeded";

const demoTemplates: CheckTemplate[] = [
  {
    id: "1",
    name: "A320 起落架常规检查",
    aircraftType: "A320",
    ataChapter: "ATA 32",
    checkArea: "起落架",
    checkItem: "主轮磨损检查、减震支柱油位检查、刹车装置检查",
    defectDesc: "",
    handling: "",
    signer: ""
  },
  {
    id: "2",
    name: "B737 电源系统检查",
    aircraftType: "B737",
    ataChapter: "ATA 24",
    checkArea: "电源系统",
    checkItem: "电瓶电压测试、APU发电机测试、外部电源检查",
    defectDesc: "",
    handling: "",
    signer: ""
  },
  {
    id: "3",
    name: "ARJ21 飞控系统检查",
    aircraftType: "ARJ21",
    ataChapter: "ATA 27",
    checkArea: "飞控",
    checkItem: "副翼作动测试、升降舵响应检查、方向舵行程检查",
    defectDesc: "",
    handling: "",
    signer: ""
  }
];

const demoRecords: ReviewRecord[] = [
  {
    id: "review-0",
    aircraftType: "A320",
    ataChapter: "ATA 32",
    checkArea: "起落架",
    status: "待复核",
    defectDesc: "主轮磨耗接近限制",
    handling: ""
  },
  {
    id: "review-1",
    aircraftType: "B737",
    ataChapter: "ATA 24",
    checkArea: "电源系统",
    status: "正常",
    defectDesc: "正常",
    handling: "正常"
  },
  {
    id: "review-2",
    aircraftType: "ARJ21",
    ataChapter: "ATA 27",
    checkArea: "飞控",
    status: "缺陷",
    defectDesc: "副翼作动测试需复查",
    handling: ""
  }
];

const demoReviewNotes: ReviewNote[] = [];

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(STORE_TEMPLATES)) {
        const templateStore = db.createObjectStore(STORE_TEMPLATES, { keyPath: "id" });
        templateStore.createIndex("name", "name", { unique: false });
        templateStore.createIndex("aircraftType", "aircraftType", { unique: false });
        templateStore.createIndex("ataChapter", "ataChapter", { unique: false });
        templateStore.createIndex("checkArea", "checkArea", { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_RECORDS)) {
        const recordStore = db.createObjectStore(STORE_RECORDS, { keyPath: "id" });
        recordStore.createIndex("aircraftType", "aircraftType", { unique: false });
        recordStore.createIndex("ataChapter", "ataChapter", { unique: false });
        recordStore.createIndex("checkArea", "checkArea", { unique: false });
        recordStore.createIndex("status", "status", { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_REVIEW_NOTES)) {
        const noteStore = db.createObjectStore(STORE_REVIEW_NOTES, { keyPath: "recordId" });
      }

      if (!db.objectStoreNames.contains(STORE_RELEASE_REVIEWS)) {
        const releaseStore = db.createObjectStore(STORE_RELEASE_REVIEWS, { keyPath: "recordId" });
        releaseStore.createIndex("status", "status", { unique: false });
        releaseStore.createIndex("reviewer", "reviewer", { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_DEFECTS)) {
        const defectStore = db.createObjectStore(STORE_DEFECTS, { keyPath: "id" });
        defectStore.createIndex("sourceRecordId", "sourceRecordId", { unique: false });
        defectStore.createIndex("status", "status", { unique: false });
        defectStore.createIndex("assignedSigner", "assignedSigner", { unique: false });
        defectStore.createIndex("aircraftType", "aircraftType", { unique: false });
        defectStore.createIndex("ataChapter", "ataChapter", { unique: false });
        defectStore.createIndex("createdAt", "createdAt", { unique: false });
        defectStore.createIndex("priority", "priority", { unique: false });
        defectStore.createIndex("expectedCompletionTime", "expectedCompletionTime", { unique: false });
      } else {
        const defectStore = event.target!.transaction!.objectStore(STORE_DEFECTS);
        if (!defectStore.indexNames.contains("priority")) {
          defectStore.createIndex("priority", "priority", { unique: false });
        }
        if (!defectStore.indexNames.contains("expectedCompletionTime")) {
          defectStore.createIndex("expectedCompletionTime", "expectedCompletionTime", { unique: false });
        }
        const migrateCursor = defectStore.openCursor();
        migrateCursor.onsuccess = () => {
          const cursor = migrateCursor.result;
          if (cursor) {
            const value = cursor.value as any;
            let needUpdate = false;
            if (!value.priority) {
              value.priority = "medium";
              needUpdate = true;
            }
            if (needUpdate) {
              cursor.update(value);
            }
            cursor.continue();
          }
        };
      }

      if (!db.objectStoreNames.contains(STORE_STATUS_HISTORY)) {
        const historyStore = db.createObjectStore(STORE_STATUS_HISTORY, { keyPath: "id" });
        historyStore.createIndex("recordId", "recordId", { unique: false });
        historyStore.createIndex("operatorRole", "operatorRole", { unique: false });
        historyStore.createIndex("changedAt", "changedAt", { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_TRAINING_COMMENTS)) {
        const commentStore = db.createObjectStore(STORE_TRAINING_COMMENTS, { keyPath: "recordId" });
        commentStore.createIndex("trainer", "trainer", { unique: false });
        commentStore.createIndex("createdAt", "createdAt", { unique: false });
        commentStore.createIndex("status", "status", { unique: false });
      } else {
        const commentStore = event.target!.transaction!.objectStore(STORE_TRAINING_COMMENTS);
        if (!commentStore.indexNames.contains("status")) {
          commentStore.createIndex("status", "status", { unique: false });
        }
        const migrateCursor = commentStore.openCursor();
        migrateCursor.onsuccess = () => {
          const cursor = migrateCursor.result;
          if (cursor) {
            const value = cursor.value as any;
            if (!value.status) {
              value.status = value.comment && value.comment.trim().length > 0 ? "已闭环" : "待讲评";
              cursor.update(value);
            }
            cursor.continue();
          }
        };
      }

      if (!db.objectStoreNames.contains("workflowConfigs")) {
        const wfConfigStore = db.createObjectStore("workflowConfigs", { keyPath: "id" });
        wfConfigStore.createIndex("aircraftType", "aircraftType", { unique: false });
        wfConfigStore.createIndex("ataChapter", "ataChapter", { unique: false });
        wfConfigStore.createIndex("checkArea", "checkArea", { unique: false });
      }
    };
  });
}

async function withDB<T>(
  storeName: string,
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => Promise<T> | T
): Promise<T> {
  const db = await openDB();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);

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

export async function seedDemoData(): Promise<void> {
  const isSeeded = localStorage.getItem(SEED_KEY);
  if (isSeeded === "true") return;

  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(
      [STORE_TEMPLATES, STORE_RECORDS, STORE_REVIEW_NOTES],
      "readwrite"
    );

    const templateStore = transaction.objectStore(STORE_TEMPLATES);
    const recordStore = transaction.objectStore(STORE_RECORDS);
    const noteStore = transaction.objectStore(STORE_REVIEW_NOTES);

    demoTemplates.forEach(t => templateStore.put(t));
    demoRecords.forEach(r => recordStore.put(r));
    demoReviewNotes.forEach(n => noteStore.put(n));

    transaction.oncomplete = () => {
      localStorage.setItem(SEED_KEY, "true");
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

export async function isDatabaseSeeded(): Promise<boolean> {
  return localStorage.getItem(SEED_KEY) === "true";
}

export async function getAllTemplates(): Promise<CheckTemplate[]> {
  return withDB(STORE_TEMPLATES, "readonly", (store) => {
    return new Promise<CheckTemplate[]>((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  });
}

export async function addTemplate(template: CheckTemplate): Promise<void> {
  return withDB(STORE_TEMPLATES, "readwrite", (store) => {
    return new Promise<void>((resolve, reject) => {
      const request = store.put(template);
      request.onsuccess = () => {
        enqueueOperation("addTemplate", template);
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  });
}

export async function updateTemplate(template: CheckTemplate): Promise<void> {
  return addTemplate(template);
}

export async function deleteTemplate(id: string): Promise<void> {
  return withDB(STORE_TEMPLATES, "readwrite", (store) => {
    return new Promise<void>((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => {
        enqueueOperation("deleteTemplate", { id });
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  });
}

export async function getAllRecords(): Promise<ReviewRecord[]> {
  return withDB(STORE_RECORDS, "readonly", (store) => {
    return new Promise<ReviewRecord[]>((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  });
}

export async function addRecord(record: ReviewRecord): Promise<void> {
  return withDB(STORE_RECORDS, "readwrite", (store) => {
    return new Promise<void>((resolve, reject) => {
      const request = store.put(record);
      request.onsuccess = () => {
        enqueueOperation("addRecord", record);
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  });
}

export async function updateRecord(record: ReviewRecord): Promise<void> {
  return withDB(STORE_RECORDS, "readwrite", (store) => {
    return new Promise<void>((resolve, reject) => {
      const request = store.put(record);
      request.onsuccess = () => {
        enqueueOperation("updateRecord", record);
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  });
}

export async function deleteRecord(id: string): Promise<void> {
  return withDB(STORE_RECORDS, "readwrite", (store) => {
    return new Promise<void>((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => {
        enqueueOperation("deleteRecord", { id });
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  });
}

export async function getAllReviewNotes(): Promise<ReviewState> {
  return withDB(STORE_REVIEW_NOTES, "readonly", (store) => {
    return new Promise<ReviewState>((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        const notes: ReviewState = {};
        (request.result as ReviewNote[]).forEach(n => {
          notes[n.recordId] = n.note;
        });
        resolve(notes);
      };
      request.onerror = () => reject(request.error);
    });
  });
}

export async function saveReviewNote(recordId: string, note: string): Promise<void> {
  return withDB(STORE_REVIEW_NOTES, "readwrite", (store) => {
    return new Promise<void>((resolve, reject) => {
      const data = { recordId, note };
      const request = store.put(data);
      request.onsuccess = () => {
        enqueueOperation("saveReviewNote", data);
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  });
}

export async function getAllReleaseReviews(): Promise<ReleaseReviewState> {
  return withDB(STORE_RELEASE_REVIEWS, "readonly", (store) => {
    return new Promise<ReleaseReviewState>((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        const reviews: ReleaseReviewState = {};
        (request.result as ReleaseReviewResult[]).forEach(r => {
          reviews[r.recordId] = r;
        });
        resolve(reviews);
      };
      request.onerror = () => reject(request.error);
    });
  });
}

export async function saveReleaseReview(review: ReleaseReviewResult): Promise<void> {
  return withDB(STORE_RELEASE_REVIEWS, "readwrite", (store) => {
    return new Promise<void>((resolve, reject) => {
      const request = store.put(review);
      request.onsuccess = () => {
        enqueueOperation("saveReleaseReview", review);
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  });
}

export async function getAllDefects(): Promise<DefectState> {
  return withDB(STORE_DEFECTS, "readonly", (store) => {
    return new Promise<DefectState>((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        const defects: DefectState = {};
        (request.result as DefectItem[]).forEach(d => {
          defects[d.id] = d;
        });
        resolve(defects);
      };
      request.onerror = () => reject(request.error);
    });
  });
}

export async function addDefect(defect: DefectItem): Promise<void> {
  return withDB(STORE_DEFECTS, "readwrite", (store) => {
    return new Promise<void>((resolve, reject) => {
      const request = store.put(defect);
      request.onsuccess = () => {
        enqueueOperation("addDefect", defect);
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  });
}

export async function updateDefect(defect: DefectItem): Promise<void> {
  return withDB(STORE_DEFECTS, "readwrite", (store) => {
    return new Promise<void>((resolve, reject) => {
      const request = store.put(defect);
      request.onsuccess = () => {
        enqueueOperation("updateDefect", defect);
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  });
}

export async function deleteDefect(id: string): Promise<void> {
  return withDB(STORE_DEFECTS, "readwrite", (store) => {
    return new Promise<void>((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => {
        enqueueOperation("deleteDefect", { id });
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  });
}

export async function createDefectFromRecord(
  record: ReviewRecord,
  options?: { priority?: DefectPriority; expectedCompletionTime?: number }
): Promise<DefectItem> {
  const now = Date.now();
  const defect: DefectItem = {
    id: `defect-${now}`,
    sourceRecordId: record.id,
    aircraftType: record.aircraftType,
    ataChapter: record.ataChapter,
    checkArea: record.checkArea,
    checkItem: record.checkItem,
    defectDesc: record.defectDesc,
    handlingOpinion: "",
    assignedSigner: "",
    status: "pending",
    priority: options?.priority || "medium",
    expectedCompletionTime: options?.expectedCompletionTime,
    createdAt: now,
    updatedAt: now
  };
  await addDefect(defect);
  enqueueOperation("createDefectFromRecord", defect);
  return defect;
}

export async function addStatusHistory(history: StatusHistoryItem): Promise<void> {
  return withDB(STORE_STATUS_HISTORY, "readwrite", (store) => {
    return new Promise<void>((resolve, reject) => {
      const request = store.put(history);
      request.onsuccess = () => {
        enqueueOperation("addStatusHistory", history);
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  });
}

export async function getStatusHistoryByRecordId(recordId: string): Promise<StatusHistoryItem[]> {
  return withDB(STORE_STATUS_HISTORY, "readonly", (store) => {
    return new Promise<StatusHistoryItem[]>((resolve, reject) => {
      const index = store.index("recordId");
      const request = index.getAll(recordId);
      request.onsuccess = () => {
        const results = request.result.sort((a, b) => b.changedAt - a.changedAt);
        resolve(results);
      };
      request.onerror = () => reject(request.error);
    });
  });
}

export async function getAllStatusHistory(): Promise<StatusHistoryState> {
  return withDB(STORE_STATUS_HISTORY, "readonly", (store) => {
    return new Promise<StatusHistoryState>((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        const history: StatusHistoryState = {};
        (request.result as StatusHistoryItem[]).forEach(item => {
          if (!history[item.recordId]) {
            history[item.recordId] = [];
          }
          history[item.recordId].push(item);
        });
        Object.keys(history).forEach(key => {
          history[key].sort((a, b) => b.changedAt - a.changedAt);
        });
        resolve(history);
      };
      request.onerror = () => reject(request.error);
    });
  });
}

export async function saveTrainingComment(comment: TrainingComment): Promise<void> {
  return withDB(STORE_TRAINING_COMMENTS, "readwrite", (store) => {
    return new Promise<void>((resolve, reject) => {
      const request = store.put(comment);
      request.onsuccess = () => {
        enqueueOperation("saveTrainingComment", comment);
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  });
}

export async function getTrainingComment(recordId: string): Promise<TrainingComment | undefined> {
  return withDB(STORE_TRAINING_COMMENTS, "readonly", (store) => {
    return new Promise<TrainingComment | undefined>((resolve, reject) => {
      const request = store.get(recordId);
      request.onsuccess = () => {
        const result = request.result as TrainingComment | undefined;
        if (result && !result.status) {
          result.status = result.comment && result.comment.trim().length > 0 ? "已闭环" : "待讲评";
        }
        resolve(result);
      };
      request.onerror = () => reject(request.error);
    });
  });
}

export async function getAllTrainingComments(): Promise<TrainingCommentState> {
  return withDB(STORE_TRAINING_COMMENTS, "readonly", (store) => {
    return new Promise<TrainingCommentState>((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        const comments: TrainingCommentState = {};
        (request.result as TrainingComment[]).forEach(c => {
          if (!c.status) {
            c.status = c.comment && c.comment.trim().length > 0 ? "已闭环" : "待讲评";
          }
          comments[c.recordId] = c;
        });
        resolve(comments);
      };
      request.onerror = () => reject(request.error);
    });
  });
}

export async function initializeDatabase(): Promise<{
  templates: CheckTemplate[];
  records: ReviewRecord[];
  reviewNotes: ReviewState;
  releaseReviews: ReleaseReviewState;
  defects: DefectState;
  statusHistory: StatusHistoryState;
  trainingComments: TrainingCommentState;
}> {
  await seedDemoData();
  await cacheStaticAssets();
  const [templates, records, reviewNotes, releaseReviews, defects, statusHistory, trainingComments] = await Promise.all([
    getAllTemplates(),
    getAllRecords(),
    getAllReviewNotes(),
    getAllReleaseReviews(),
    getAllDefects(),
    getAllStatusHistory(),
    getAllTrainingComments()
  ]);
  return { templates, records, reviewNotes, releaseReviews, defects, statusHistory, trainingComments };
}
