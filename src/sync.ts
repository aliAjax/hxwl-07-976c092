import { ReviewRecord, DefectItem, TrainingComment, StatusHistoryItem } from "./db";

export type EntityType = "record" | "defect" | "trainingComment" | "statusHistory";

export interface VersionedEntity {
  id: string;
  _version: number;
  _updatedAt: number;
  _operationId?: string;
  _contentHash?: string;
}

export type VersionedRecord = ReviewRecord & VersionedEntity;
export type VersionedDefect = DefectItem & VersionedEntity;
export type VersionedTrainingComment = TrainingComment & VersionedEntity;
export type VersionedStatusHistory = StatusHistoryItem & VersionedEntity;

export interface ConflictInfo {
  entityType: EntityType;
  entityId: string;
  localVersion: VersionedEntity;
  remoteVersion: VersionedEntity;
  localChanges: Record<string, any>;
  remoteChanges: Record<string, any>;
  resolved: boolean;
  resolution?: "keepLocal" | "acceptRemote" | "merge";
}

export interface SyncMessage {
  type: "ENTITY_UPDATED" | "ENTITY_DELETED" | "CONFLICT_DETECTED" | "REFRESH_REQUEST" | "REFRESH_RESPONSE";
  entityType?: EntityType;
  entityId?: string;
  entity?: any;
  conflict?: ConflictInfo;
  senderTabId: string;
  timestamp: number;
  operationId?: string;
}

export const TAB_ID = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const STORAGE_KEY_LAST_WRITE = "hxwl-07-last-write";
const STORAGE_KEY_OPERATION_SET = "hxwl-07-operation-set";
const CHANNEL_NAME = "hxwl-07-sync-channel";

let broadcastChannel: BroadcastChannel | null = null;
const entityUpdateListeners: Set<(message: SyncMessage) => void> = new Set();
const conflictListeners: Set<(conflict: ConflictInfo) => void> = new Set();
const refreshListeners: Set<() => void> = new Set();

const processedOperations: Set<string> = new Set();

function initProcessedOperations(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_OPERATION_SET);
    if (raw) {
      const ops = JSON.parse(raw);
      if (Array.isArray(ops)) {
        ops.forEach(op => processedOperations.add(op));
      }
    }
  } catch {}
}

function persistProcessedOperations(): void {
  try {
    const ops = Array.from(processedOperations).slice(-1000);
    localStorage.setItem(STORAGE_KEY_OPERATION_SET, JSON.stringify(ops));
  } catch {}
}

export function isOperationProcessed(operationId: string): boolean {
  if (!operationId) return false;
  return processedOperations.has(operationId);
}

export function markOperationProcessed(operationId: string): void {
  if (!operationId) return;
  processedOperations.add(operationId);
  persistProcessedOperations();
}

export function generateOperationId(): string {
  return `op-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function calculateContentHash(entity: any): string {
  const fieldsToExclude = ["_version", "_updatedAt", "_operationId", "_contentHash"];
  const cleaned: any = {};
  Object.keys(entity).forEach(key => {
    if (!fieldsToExclude.includes(key)) {
      cleaned[key] = entity[key];
    }
  });
  const str = JSON.stringify(cleaned, Object.keys(cleaned).sort());
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

export function addVersionFields<T extends { id: string }>(
  entity: T,
  existingVersion?: number,
  operationId?: string
): T & VersionedEntity {
  const now = Date.now();
  const versioned = entity as T & VersionedEntity;
  versioned._version = (existingVersion || 0) + 1;
  versioned._updatedAt = now;
  if (operationId) {
    versioned._operationId = operationId;
  }
  versioned._contentHash = calculateContentHash(entity);
  return versioned;
}

function deepDiff(obj1: any, obj2: any): Record<string, { old: any; new: any }> {
  const diff: Record<string, { old: any; new: any }> = {};
  const allKeys = new Set([...Object.keys(obj1 || {}), ...Object.keys(obj2 || {})]);
  const excludeKeys = ["_version", "_updatedAt", "_operationId", "_contentHash"];
  
  allKeys.forEach(key => {
    if (excludeKeys.includes(key)) return;
    const v1 = obj1?.[key];
    const v2 = obj2?.[key];
    if (JSON.stringify(v1) !== JSON.stringify(v2)) {
      diff[key] = { old: v1, new: v2 };
    }
  });
  return diff;
}

export function detectConflict(
  localEntity: VersionedEntity,
  remoteEntity: VersionedEntity
): ConflictInfo | null {
  if (localEntity.id !== remoteEntity.id) return null;
  
  if (localEntity._operationId && localEntity._operationId === remoteEntity._operationId) {
    return null;
  }
  
  if (localEntity._contentHash === remoteEntity._contentHash) {
    return null;
  }
  
  if (remoteEntity._version <= localEntity._version && 
      remoteEntity._updatedAt <= localEntity._updatedAt) {
    return null;
  }
  
  const localChanges = deepDiff(localEntity, remoteEntity);
  const remoteChanges = deepDiff(remoteEntity, localEntity);
  
  if (Object.keys(localChanges).length === 0) return null;
  
  let entityType: EntityType = "record";
  if ("sourceRecordId" in localEntity) entityType = "defect";
  else if ("comment" in localEntity) entityType = "trainingComment";
  else if ("fromStatus" in localEntity) entityType = "statusHistory";
  
  return {
    entityType,
    entityId: localEntity.id,
    localVersion: localEntity,
    remoteVersion: remoteEntity,
    localChanges,
    remoteChanges,
    resolved: false
  };
}

function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  if (!broadcastChannel) {
    broadcastChannel = new BroadcastChannel(CHANNEL_NAME);
  }
  return broadcastChannel;
}

export function broadcastEntityUpdate(
  entityType: EntityType,
  entity: any,
  operationId?: string
): void {
  const message: SyncMessage = {
    type: "ENTITY_UPDATED",
    entityType,
    entityId: entity.id,
    entity,
    senderTabId: TAB_ID,
    timestamp: Date.now(),
    operationId
  };
  
  try {
    localStorage.setItem(STORAGE_KEY_LAST_WRITE, JSON.stringify({
      entityType,
      entityId: entity.id,
      timestamp: message.timestamp,
      operationId,
      senderTabId: TAB_ID
    }));
  } catch {}
  
  const channel = getChannel();
  if (channel) {
    channel.postMessage(message);
  }
}

export function broadcastEntityDelete(
  entityType: EntityType,
  entityId: string,
  operationId?: string
): void {
  const message: SyncMessage = {
    type: "ENTITY_DELETED",
    entityType,
    entityId,
    senderTabId: TAB_ID,
    timestamp: Date.now(),
    operationId
  };
  
  const channel = getChannel();
  if (channel) {
    channel.postMessage(message);
  }
}

export function broadcastConflict(conflict: ConflictInfo): void {
  const message: SyncMessage = {
    type: "CONFLICT_DETECTED",
    conflict,
    senderTabId: TAB_ID,
    timestamp: Date.now()
  };
  
  const channel = getChannel();
  if (channel) {
    channel.postMessage(message);
  }
  
  conflictListeners.forEach(listener => listener(conflict));
}

export function requestRefresh(): void {
  const message: SyncMessage = {
    type: "REFRESH_REQUEST",
    senderTabId: TAB_ID,
    timestamp: Date.now()
  };
  
  const channel = getChannel();
  if (channel) {
    channel.postMessage(message);
  }
}

export function subscribeEntityUpdates(
  listener: (message: SyncMessage) => void
): () => void {
  entityUpdateListeners.add(listener);
  return () => entityUpdateListeners.delete(listener);
}

export function subscribeConflicts(
  listener: (conflict: ConflictInfo) => void
): () => void {
  conflictListeners.add(listener);
  return () => conflictListeners.delete(listener);
}

export function subscribeRefresh(
  listener: () => void
): () => void {
  refreshListeners.add(listener);
  return () => refreshListeners.delete(listener);
}

function handleIncomingMessage(message: SyncMessage): void {
  if (message.senderTabId === TAB_ID) return;
  
  if (message.operationId && isOperationProcessed(message.operationId)) {
    return;
  }
  
  switch (message.type) {
    case "ENTITY_UPDATED":
    case "ENTITY_DELETED":
      entityUpdateListeners.forEach(listener => listener(message));
      if (message.operationId) {
        markOperationProcessed(message.operationId);
      }
      break;
    case "CONFLICT_DETECTED":
      if (message.conflict) {
        conflictListeners.forEach(listener => listener(message.conflict as ConflictInfo));
      }
      break;
    case "REFRESH_REQUEST":
      refreshListeners.forEach(listener => listener());
      break;
  }
}

function handleStorageEvent(event: StorageEvent): void {
  if (event.key === STORAGE_KEY_LAST_WRITE && event.newValue) {
    try {
      const data = JSON.parse(event.newValue);
      if (data.senderTabId === TAB_ID) return;
      if (data.operationId && isOperationProcessed(data.operationId)) return;
      
      refreshListeners.forEach(listener => listener());
    } catch {}
  }
}

export function initSync(): () => void {
  initProcessedOperations();
  
  const channel = getChannel();
  const messageHandler = (event: MessageEvent) => {
    handleIncomingMessage(event.data as SyncMessage);
  };
  
  if (channel) {
    channel.addEventListener("message", messageHandler);
  }
  
  window.addEventListener("storage", handleStorageEvent);
  
  const handleOnline = () => requestRefresh();
  window.addEventListener("online", handleOnline);
  
  return () => {
    if (channel) {
      channel.removeEventListener("message", messageHandler);
      channel.close();
      broadcastChannel = null;
    }
    window.removeEventListener("storage", handleStorageEvent);
    window.removeEventListener("online", handleOnline);
  };
}

export function getEntityTypeLabel(type: EntityType): string {
  const labels: Record<EntityType, string> = {
    record: "检查记录",
    defect: "缺陷",
    trainingComment: "讲评备注",
    statusHistory: "状态历史"
  };
  return labels[type];
}
