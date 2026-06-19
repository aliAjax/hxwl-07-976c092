import { useState, useRef, useEffect, useCallback } from "react";
import {
  NetworkStatus,
  SyncStatus,
  SyncOperation,
  SWStatus,
  initNetworkMonitoring,
  subscribeNetworkStatus,
  subscribeSyncQueue,
  subscribeSyncStatus,
  subscribeSWStatus,
  attemptAutoSync,
  getPendingSyncCount,
  getLastSyncTime,
  isStaticCacheAvailable,
  getOperationLabel,
  getOperationSummary,
  clearSyncedOperations,
  removeFromQueue,
  retryOperation,
  getSWStatusText,
  getCacheInfo,
  clearCache,
  precacheAssets,
  updateServiceWorker,
  activateWaitingWorker
} from "../offline";
import {
  initSync,
  subscribeEntityUpdates,
  subscribeConflicts,
  subscribeRefresh,
  detectConflict,
  broadcastConflict,
  getEntityTypeLabel,
  ConflictInfo,
  SyncMessage,
  VersionedEntity,
  VersionedRecord,
  VersionedDefect,
  VersionedTrainingComment,
  markOperationProcessed
} from "../sync";
import {
  ReviewRecord,
  DefectItem,
  TrainingComment,
  updateRecord,
  updateDefect,
  saveTrainingComment
} from "../db";

export interface UseOfflineSyncOptions {
  onEntityUpdate?: (message: SyncMessage) => void;
  onConflict?: (conflict: ConflictInfo) => void;
  onRefresh?: () => void;
}

export function useOfflineSync(options: UseOfflineSyncOptions = {}) {
  const { onEntityUpdate, onConflict, onRefresh } = options;

  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>(
    typeof navigator !== "undefined" && navigator.onLine ? "online" : "offline"
  );
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [syncQueue, setSyncQueue] = useState<SyncOperation[]>([]);
  const [showSyncPanel, setShowSyncPanel] = useState(false);
  const [showOnlineRestoredToast, setShowOnlineRestoredToast] = useState(false);
  const [cacheReady, setCacheReady] = useState(false);
  const [swStatus, setSwStatus] = useState<SWStatus | null>(null);
  const [showCachePanel, setShowCachePanel] = useState(false);
  const [offlineSaveToast, setOfflineSaveToast] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<ConflictInfo[]>([]);
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [selectedConflict, setSelectedConflict] = useState<ConflictInfo | null>(null);
  const [dataRefreshIndicator, setDataRefreshIndicator] = useState(false);

  const prevNetworkRef = useRef<NetworkStatus>(
    typeof navigator !== "undefined" && navigator.onLine ? "online" : "offline"
  );
  const toastTimerRef = useRef<number | null>(null);
  const offlineToastTimerRef = useRef<number | null>(null);
  const conflictsRef = useRef<ConflictInfo[]>(conflicts);

  useEffect(() => { conflictsRef.current = conflicts; }, [conflicts]);

  const showOfflineSaveToast = useCallback((label: string) => {
    setOfflineSaveToast(label);
    if (offlineToastTimerRef.current) window.clearTimeout(offlineToastTimerRef.current);
    offlineToastTimerRef.current = window.setTimeout(() => setOfflineSaveToast(null), 2500);
  }, []);

  const handleIncomingConflict = useCallback((conflict: ConflictInfo) => {
    setConflicts(prev => {
      const exists = prev.some(c => 
        c.entityType === conflict.entityType && 
        c.entityId === conflict.entityId &&
        !c.resolved
      );
      if (exists) return prev;
      return [...prev, conflict];
    });
    setShowConflictModal(true);
    setSelectedConflict(conflict);
    if (onConflict) {
      onConflict(conflict);
    }
  }, [onConflict]);

  const handleConflictDetected = useCallback((conflict: ConflictInfo) => {
    broadcastConflict(conflict);
    handleIncomingConflict(conflict);
  }, [handleIncomingConflict]);

  const initOfflineSync = useCallback(() => {
    const cleanupNetwork = initNetworkMonitoring();
    const cleanupSync = initSync();
    
    const unsubscribeNetwork = subscribeNetworkStatus((status) => {
      const prev = prevNetworkRef.current;
      prevNetworkRef.current = status;
      setNetworkStatus(status);
      if (prev === "offline" && status === "online") {
        setShowOnlineRestoredToast(true);
        if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
        toastTimerRef.current = window.setTimeout(() => setShowOnlineRestoredToast(false), 4000);
        attemptAutoSync();
      }
    });
    const unsubscribeSyncQueue = subscribeSyncQueue((queue) => {
      setSyncQueue(queue);
    });
    const unsubscribeSyncStatus = subscribeSyncStatus((status) => {
      setSyncStatus(status);
    });
    const unsubscribeSWStatus = subscribeSWStatus((status) => {
      setSwStatus(status);
    });
    
    const unsubscribeEntityUpdates = subscribeEntityUpdates((message) => {
      if (onEntityUpdate) {
        onEntityUpdate(message);
      }
    });
    const unsubscribeConflicts = subscribeConflicts(handleIncomingConflict);
    const unsubscribeRefresh = subscribeRefresh(() => {
      setDataRefreshIndicator(true);
      if (onRefresh) {
        onRefresh();
      }
      setDataRefreshIndicator(false);
    });
    
    getCacheInfo();
    setCacheReady(isStaticCacheAvailable());

    return () => {
      cleanupNetwork();
      cleanupSync();
      unsubscribeNetwork();
      unsubscribeSyncQueue();
      unsubscribeSyncStatus();
      unsubscribeSWStatus();
      unsubscribeEntityUpdates();
      unsubscribeConflicts();
      unsubscribeRefresh();
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, [onEntityUpdate, handleIncomingConflict, onRefresh]);

  const pendingCount = getPendingSyncCount();
  const lastSync = getLastSyncTime();
  const failedCount = syncQueue.filter(op => !op.synced && op.error).length;
  const waitingCount = syncQueue.filter(op => !op.synced && !op.error).length;

  const handleRetryOperation = (opId: string) => {
    if (networkStatus === "offline") {
      alert("当前处于离线状态，无法重试。请恢复网络后再操作。");
      return;
    }
    retryOperation(opId);
  };

  const handleDiscardOperation = (opId: string) => {
    const confirmed = window.confirm("确认丢弃该操作？丢弃后数据将仅保留在本地，不会再尝试同步。");
    if (!confirmed) return;
    removeFromQueue(opId);
  };

  const handleManualSync = async () => {
    if (networkStatus === "offline") {
      alert("当前处于离线状态，请恢复网络后再尝试同步。");
      return;
    }
    await attemptAutoSync();
  };

  const handleClearCache = async () => {
    const confirmed = window.confirm(
      "确定要清除所有离线缓存吗？\n\n清除后需要重新联网才能缓存资源。"
    );
    if (!confirmed) return;
    const success = await clearCache();
    if (success) {
      setCacheReady(false);
      alert("离线缓存已清除，请刷新页面以重新加载。");
    } else {
      alert("清除缓存失败，请稍后重试。");
    }
  };

  const handlePrecache = async () => {
    const success = await precacheAssets();
    if (success) {
      alert("资源预缓存完成！");
    } else {
      alert("预缓存可能未完全完成，请检查网络连接。");
    }
    await getCacheInfo();
  };

  const handleUpdateSW = async () => {
    const success = await updateServiceWorker();
    if (success) {
      alert("Service Worker 已检查更新，如有新版本将自动下载。");
    } else {
      alert("检查更新失败，请稍后重试。");
    }
  };

  const handleActivateWaiting = () => {
    activateWaitingWorker();
    window.location.reload();
  };

  const handleRefreshCacheInfo = async () => {
    await getCacheInfo();
  };

  const resolveConflict = async (conflict: ConflictInfo, resolution: "keepLocal" | "acceptRemote") => {
    conflict.resolved = true;
    conflict.resolution = resolution;

    if (resolution === "acceptRemote") {
      if (conflict.entityType === "record") {
        const remoteRecord = conflict.remoteVersion as VersionedRecord;
        const versionedRecord = await updateRecord(remoteRecord);
        if (onEntityUpdate) {
          onEntityUpdate({
            type: "ENTITY_UPDATED",
            entityType: "record",
            entityId: versionedRecord.id,
            entity: versionedRecord,
            senderTabId: "",
            timestamp: Date.now()
          });
        }
      } else if (conflict.entityType === "defect") {
        const remoteDefect = conflict.remoteVersion as unknown as DefectItem;
        const versionedDefect = await updateDefect(remoteDefect);
        if (onEntityUpdate) {
          onEntityUpdate({
            type: "ENTITY_UPDATED",
            entityType: "defect",
            entityId: versionedDefect.id,
            entity: versionedDefect,
            senderTabId: "",
            timestamp: Date.now()
          });
        }
      } else if (conflict.entityType === "trainingComment") {
        const remoteComment = conflict.remoteVersion as unknown as TrainingComment;
        const versionedComment = await saveTrainingComment(remoteComment);
        if (onEntityUpdate) {
          onEntityUpdate({
            type: "ENTITY_UPDATED",
            entityType: "trainingComment",
            entityId: versionedComment.recordId,
            entity: versionedComment,
            senderTabId: "",
            timestamp: Date.now()
          });
        }
      }
    } else {
      if (conflict.entityType === "record") {
        const localRecord = conflict.localVersion as VersionedRecord;
        const versionedRecord = await updateRecord(localRecord);
        if (onEntityUpdate) {
          onEntityUpdate({
            type: "ENTITY_UPDATED",
            entityType: "record",
            entityId: versionedRecord.id,
            entity: versionedRecord,
            senderTabId: "",
            timestamp: Date.now()
          });
        }
      } else if (conflict.entityType === "defect") {
        const localDefect = conflict.localVersion as unknown as DefectItem;
        const versionedDefect = await updateDefect(localDefect);
        if (onEntityUpdate) {
          onEntityUpdate({
            type: "ENTITY_UPDATED",
            entityType: "defect",
            entityId: versionedDefect.id,
            entity: versionedDefect,
            senderTabId: "",
            timestamp: Date.now()
          });
        }
      } else if (conflict.entityType === "trainingComment") {
        const localComment = conflict.localVersion as unknown as TrainingComment;
        const versionedComment = await saveTrainingComment(localComment);
        if (onEntityUpdate) {
          onEntityUpdate({
            type: "ENTITY_UPDATED",
            entityType: "trainingComment",
            entityId: versionedComment.recordId,
            entity: versionedComment,
            senderTabId: "",
            timestamp: Date.now()
          });
        }
      }
    }

    setConflicts(prev => prev.filter(c => 
      !(c.entityType === conflict.entityType && c.entityId === conflict.entityId)
    ));
    setSelectedConflict(null);
    if (conflictsRef.current.length <= 1) {
      setShowConflictModal(false);
    }
  };

  const dismissConflict = (conflict: ConflictInfo) => {
    setConflicts(prev => prev.filter(c => 
      !(c.entityType === conflict.entityType && c.entityId === conflict.entityId)
    ));
    setSelectedConflict(null);
    if (conflictsRef.current.length <= 1) {
      setShowConflictModal(false);
    }
  };

  const formatLastSync = (timestamp: number | null) => {
    if (!timestamp) return "从未同步";
    return new Date(timestamp).toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  };

  return {
    networkStatus,
    syncStatus,
    syncQueue,
    showSyncPanel,
    showOnlineRestoredToast,
    cacheReady,
    swStatus,
    showCachePanel,
    offlineSaveToast,
    conflicts,
    showConflictModal,
    selectedConflict,
    dataRefreshIndicator,
    pendingCount,
    lastSync,
    failedCount,
    waitingCount,
    setShowSyncPanel,
    setShowCachePanel,
    setShowConflictModal,
    setSelectedConflict,
    setConflicts,
    initOfflineSync,
    showOfflineSaveToast,
    handleRetryOperation,
    handleDiscardOperation,
    handleManualSync,
    handleClearCache,
    handlePrecache,
    handleUpdateSW,
    handleActivateWaiting,
    handleRefreshCacheInfo,
    resolveConflict,
    dismissConflict,
    handleConflictDetected,
    formatLastSync,
    getOperationLabel,
    getOperationSummary,
    getSWStatusText,
    getEntityTypeLabel,
    clearSyncedOperations,
    detectConflict,
    markOperationProcessed
  };
}
