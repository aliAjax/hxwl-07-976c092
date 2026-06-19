import { useState } from "react";
import {
  StatusHistoryItem,
  StatusHistoryState,
  UserRole as DBUserRole,
  addStatusHistory,
  getAllStatusHistory
} from "../db";

export type UserRole = "维修工程师" | "放行人员" | "培训教员";

export function useStatusHistory() {
  const [statusHistory, setStatusHistory] = useState<StatusHistoryState>({});
  const [activeHistoryRecordId, setActiveHistoryRecordId] = useState<string | null>(null);

  const loadStatusHistory = async () => {
    const data = await getAllStatusHistory();
    setStatusHistory(data);
  };

  const recordStatusChange = async (
    recordId: string,
    fromStatus: string,
    toStatus: string,
    operatorRole: UserRole,
    operatorName: string,
    remark?: string,
    fieldChanges?: Record<string, { oldValue: string; newValue: string }>
  ) => {
    if (fromStatus === toStatus) return;
    const historyItem: StatusHistoryItem = {
      id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      recordId,
      fromStatus,
      toStatus,
      operatorRole: operatorRole as DBUserRole,
      operatorName,
      changedAt: Date.now(),
      remark,
      fieldChanges
    };
    try {
      const versionedHistory = await addStatusHistory(historyItem);
      setStatusHistory(prev => {
        const next = { ...prev };
        if (!next[recordId]) {
          next[recordId] = [];
        }
        next[recordId] = [versionedHistory, ...next[recordId]];
        return next;
      });
    } catch (error) {
      console.error("Failed to record status history:", error);
    }
  };

  const toggleHistory = (recordId: string) => {
    setActiveHistoryRecordId(prev => prev === recordId ? null : recordId);
  };

  const getRecordHistory = (recordId: string): StatusHistoryItem[] => {
    return statusHistory[recordId] || [];
  };

  const setHistoryFromData = (data: StatusHistoryState) => {
    setStatusHistory(data);
  };

  return {
    statusHistory,
    activeHistoryRecordId,
    setActiveHistoryRecordId,
    loadStatusHistory,
    recordStatusChange,
    toggleHistory,
    getRecordHistory,
    setHistoryFromData
  };
}
