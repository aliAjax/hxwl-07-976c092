import { useState, useMemo, useRef } from "react";
import {
  DefectItem,
  DefectState,
  DefectPriority,
  ReviewRecord,
  getAllDefects,
  updateDefect,
  createDefectFromRecord,
  deleteDefect
} from "../db";
import { getDefectStatusBadgeClass, getDefectStatusText } from "../workflow";

export interface DefectFormValues {
  handlingOpinion: string;
  assignedSigner: string;
  rejectedReason: string;
  completedNote: string;
  priority: DefectPriority;
  expectedCompletionTime: string;
}

export interface UseDefectsOptions {
  networkStatus?: "online" | "offline";
  onOfflineSave?: (label: string) => void;
}

const PRIORITY_WEIGHT: Record<DefectPriority, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1
};

const PRIORITY_TEXT: Record<DefectPriority, string> = {
  critical: "紧急",
  high: "高",
  medium: "中",
  low: "低"
};

const SOON_THRESHOLD_MS = 24 * 60 * 60 * 1000;

const formatDateTimeLocalValue = (timestamp?: number): string => {
  if (!timestamp) return "";
  const d = new Date(timestamp);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export function useDefects(options: UseDefectsOptions = {}) {
  const { networkStatus = "online", onOfflineSave } = options;

  const [defects, setDefects] = useState<DefectState>({});
  const [defectFormValues, setDefectFormValues] = useState<Record<string, DefectFormValues>>({});
  const [activeDefectTab, setActiveDefectTab] = useState<"pending" | "history">("pending");
  const [isCreateDefectModalOpen, setIsCreateDefectModalOpen] = useState(false);
  const [createDefectSourceRecord, setCreateDefectSourceRecord] = useState<ReviewRecord | null>(null);
  const [createDefectPriority, setCreateDefectPriority] = useState<DefectPriority>("medium");
  const [createDefectExpectedTime, setCreateDefectExpectedTime] = useState<string>("");
  const [timeTick, setTimeTick] = useState(0);

  const defectsRef = useRef<Record<string, DefectItem>>(defects);
  useMemo(() => { defectsRef.current = defects; }, [defects]);

  const loadDefects = async () => {
    const data = await getAllDefects();
    setDefects(data);
  };

  const setDefectsFromData = (data: DefectState | ((prev: DefectState) => DefectState)) => {
    setDefects(data as any);
  };

  const showOfflineToast = (label: string) => {
    if (networkStatus === "offline" && onOfflineSave) {
      onOfflineSave(label);
    }
  };

  const handleDefectFormChange = (defectId: string, field: string, value: string) => {
    const defect = defects[defectId];
    setDefectFormValues(prev => ({
      ...prev,
      [defectId]: {
        ...prev[defectId],
        handlingOpinion: prev[defectId]?.handlingOpinion ?? "",
        assignedSigner: prev[defectId]?.assignedSigner ?? "",
        rejectedReason: prev[defectId]?.rejectedReason ?? "",
        completedNote: prev[defectId]?.completedNote ?? "",
        priority: prev[defectId]?.priority ?? defect?.priority ?? "medium",
        expectedCompletionTime: prev[defectId]?.expectedCompletionTime ?? formatDateTimeLocalValue(defect?.expectedCompletionTime),
        [field]: value
      }
    }));
  };

  const handleDefectPriorityOrTimeSave = async (defectId: string, field: "priority" | "expectedCompletionTime", value: string) => {
    const defect = defects[defectId];
    if (!defect) return;
    const updatedDefect: DefectItem = {
      ...defect,
      [field]: field === "expectedCompletionTime" && value ? new Date(value).getTime() : (field === "expectedCompletionTime" ? undefined : value),
      updatedAt: Date.now()
    };
    try {
      const versionedDefect = await updateDefect(updatedDefect);
      setDefects(prev => ({ ...prev, [defectId]: versionedDefect }));
      showOfflineToast("缺陷更新已暂存本地");
    } catch (error) {
      console.error("Failed to update defect:", error);
    }
  };

  const handleStartProcessing = async (defectId: string) => {
    const defect = defects[defectId];
    if (!defect) return;

    const formVals = defectFormValues[defectId] || {};
    const handlingOpinion = formVals.handlingOpinion || defect.handlingOpinion;
    const assignedSigner = formVals.assignedSigner || defect.assignedSigner;
    const priority = (formVals.priority as DefectPriority) || defect.priority;
    const expectedCompletionTime = formVals.expectedCompletionTime
      ? new Date(formVals.expectedCompletionTime).getTime()
      : defect.expectedCompletionTime;

    if (!handlingOpinion.trim()) {
      alert("请填写处理意见！");
      return;
    }
    if (!assignedSigner.trim()) {
      alert("请指定签署人！");
      return;
    }

    const updatedDefect: DefectItem = {
      ...defect,
      handlingOpinion,
      assignedSigner,
      priority,
      expectedCompletionTime,
      status: "processing",
      updatedAt: Date.now()
    };

    try {
      const versionedDefect = await updateDefect(updatedDefect);
      setDefects(prev => ({ ...prev, [defectId]: versionedDefect }));
      showOfflineToast("缺陷更新已暂存本地");
    } catch (error) {
      console.error("Failed to start processing defect:", error);
    }
  };

  const handleCompleteDefect = async (defectId: string) => {
    const defect = defects[defectId];
    if (!defect) return;

    const formVals = defectFormValues[defectId] || {};
    const completedNote = formVals.completedNote || "";

    const confirmed = window.confirm("确认标记该缺陷为已完成？完成后将移至历史记录。");
    if (!confirmed) return;

    const now = Date.now();
    const updatedDefect: DefectItem = {
      ...defect,
      status: "completed",
      completedNote,
      completedAt: now,
      updatedAt: now
    };

    try {
      const versionedDefect = await updateDefect(updatedDefect);
      setDefects(prev => ({ ...prev, [defectId]: versionedDefect }));
      setDefectFormValues(prev => {
        const next = { ...prev };
        delete next[defectId];
        return next;
      });
      showOfflineToast("缺陷更新已暂存本地");
    } catch (error) {
      console.error("Failed to complete defect:", error);
    }
  };

  const handleRejectDefect = async (defectId: string, rejectedReasonOverride?: string) => {
    const defect = defects[defectId];
    if (!defect) return;

    const formVals = defectFormValues[defectId] || {};
    const rejectedReason = rejectedReasonOverride || formVals.rejectedReason || "";

    if (!rejectedReason.trim()) {
      alert("请填写退回复核原因！");
      return;
    }

    const confirmed = window.confirm("确认退回该缺陷？退回后需要重新处理。");
    if (!confirmed) return;

    const now = Date.now();
    const updatedDefect: DefectItem = {
      ...defect,
      status: "rejected",
      rejectedReason,
      rejectedAt: now,
      updatedAt: now
    };

    try {
      const versionedDefect = await updateDefect(updatedDefect);
      setDefects(prev => ({ ...prev, [defectId]: versionedDefect }));
      setDefectFormValues(prev => {
        const next = { ...prev };
        delete next[defectId];
        return next;
      });
      showOfflineToast("缺陷更新已暂存本地");
    } catch (error) {
      console.error("Failed to reject defect:", error);
    }
  };

  const handleReopenDefect = async (defectId: string) => {
    const defect = defects[defectId];
    if (!defect) return;

    const confirmed = window.confirm("确认重新打开该缺陷？将重新进入待处理状态。");
    if (!confirmed) return;

    const updatedDefect: DefectItem = {
      ...defect,
      status: "pending",
      handlingOpinion: "",
      assignedSigner: "",
      completedNote: undefined,
      completedAt: undefined,
      rejectedReason: undefined,
      rejectedAt: undefined,
      updatedAt: Date.now()
    };

    try {
      const versionedDefect = await updateDefect(updatedDefect);
      setDefects(prev => ({ ...prev, [defectId]: versionedDefect }));
      showOfflineToast("缺陷更新已暂存本地");
    } catch (error) {
      console.error("Failed to reopen defect:", error);
    }
  };

  const handleDeleteDefect = async (defectId: string) => {
    const confirmed = window.confirm("确认删除该缺陷记录？此操作不可恢复。");
    if (!confirmed) return;

    try {
      await deleteDefect(defectId);
      setDefects(prev => {
        const next = { ...prev };
        delete next[defectId];
        return next;
      });
    } catch (error) {
      console.error("Failed to delete defect:", error);
    }
  };

  const handleGenerateDefectFromRecord = (record: ReviewRecord) => {
    const existingDefect = Object.values(defectsRef.current).find(d => d.sourceRecordId === record.id);
    if (existingDefect) {
      alert("该缺陷项已存在于待处理清单中！");
      return;
    }
    setCreateDefectSourceRecord(record);
    setCreateDefectPriority("medium");
    setCreateDefectExpectedTime("");
    setIsCreateDefectModalOpen(true);
  };

  const handleConfirmCreateDefect = async () => {
    if (!createDefectSourceRecord) return;
    try {
      const opts: { priority?: DefectPriority; expectedCompletionTime?: number } = {
        priority: createDefectPriority
      };
      if (createDefectExpectedTime) {
        opts.expectedCompletionTime = new Date(createDefectExpectedTime).getTime();
      }
      const defect = await createDefectFromRecord(createDefectSourceRecord, opts);
      setDefects(prev => ({ ...prev, [defect.id]: defect }));
      setIsCreateDefectModalOpen(false);
      setCreateDefectSourceRecord(null);
      alert("缺陷项已添加到待处理清单！");
    } catch (error) {
      console.error("Failed to generate defect from record:", error);
      alert("生成缺陷项失败，请重试。");
    }
  };

  const handleCancelCreateDefect = () => {
    setIsCreateDefectModalOpen(false);
    setCreateDefectSourceRecord(null);
  };

  const getPriorityText = (priority: DefectPriority): string => {
    return PRIORITY_TEXT[priority];
  };

  const getPriorityBadgeClass = (priority: DefectPriority): string => {
    switch (priority) {
      case "critical": return "defect-priority-critical";
      case "high": return "defect-priority-high";
      case "medium": return "defect-priority-medium";
      case "low": return "defect-priority-low";
    }
  };

  const getDefaultDefectFormValues = (defect: DefectItem): DefectFormValues => ({
    handlingOpinion: "",
    assignedSigner: "",
    rejectedReason: "",
    completedNote: "",
    priority: defect.priority || "medium",
    expectedCompletionTime: formatDateTimeLocalValue(defect.expectedCompletionTime)
  });

  const getTimeStatus = (defect: DefectItem): { status: "overdue" | "soon" | "normal" | "none"; remainingMs: number; displayText: string } => {
    const now = Date.now();
    if (!defect.expectedCompletionTime) {
      return { status: "none", remainingMs: 0, displayText: "未设期限" };
    }
    const remainingMs = defect.expectedCompletionTime - now;
    const absMs = Math.abs(remainingMs);

    const formatDuration = (ms: number): string => {
      const days = Math.floor(ms / (24 * 60 * 60 * 1000));
      const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
      const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
      if (days > 0) return `${days}天${hours}小时`;
      if (hours > 0) return `${hours}小时${minutes}分`;
      return `${minutes}分钟`;
    };

    if (remainingMs < 0) {
      return {
        status: "overdue",
        remainingMs,
        displayText: `已逾期 ${formatDuration(absMs)}`
      };
    } else if (remainingMs <= SOON_THRESHOLD_MS) {
      return {
        status: "soon",
        remainingMs,
        displayText: `剩余 ${formatDuration(remainingMs)}`
      };
    } else {
      return {
        status: "normal",
        remainingMs,
        displayText: `剩余 ${formatDuration(remainingMs)}`
      };
    }
  };

  const isOverdue = (defect: DefectItem): boolean => {
    return !!defect.expectedCompletionTime && defect.expectedCompletionTime < Date.now();
  };

  const isSoonOverdue = (defect: DefectItem): boolean => {
    if (!defect.expectedCompletionTime) return false;
    const remaining = defect.expectedCompletionTime - Date.now();
    return remaining > 0 && remaining <= SOON_THRESHOLD_MS;
  };

  const defectStats = useMemo(() => {
    const allDefects = Object.values(defects);
    const pending = allDefects.filter(d => d.status === "pending").length;
    const processing = allDefects.filter(d => d.status === "processing").length;
    const completed = allDefects.filter(d => d.status === "completed").length;
    const rejected = allDefects.filter(d => d.status === "rejected").length;
    const activeDefects = allDefects.filter(d => d.status === "pending" || d.status === "processing");
    const overdue = activeDefects.filter(d => isOverdue(d)).length;
    const soonOverdue = activeDefects.filter(d => isSoonOverdue(d)).length;
    return { total: allDefects.length, pending, processing, completed, rejected, overdue, soonOverdue };
  }, [defects, timeTick]);

  const groupedDefects = useMemo(() => {
    const allDefects = Object.values(defects);
    const pending = allDefects
      .filter(d => d.status === "pending" || d.status === "processing")
      .sort((a, b) => {
        const aOverdue = isOverdue(a) ? 1 : 0;
        const bOverdue = isOverdue(b) ? 1 : 0;
        if (aOverdue !== bOverdue) return bOverdue - aOverdue;
        const aPriority = PRIORITY_WEIGHT[a.priority] || 0;
        const bPriority = PRIORITY_WEIGHT[b.priority] || 0;
        if (aPriority !== bPriority) return bPriority - aPriority;
        return b.createdAt - a.createdAt;
      });
    const history = allDefects.filter(d => d.status === "completed" || d.status === "rejected");
    return { pending, history };
  }, [defects, timeTick]);

  const getDefectSourceRecord = (sourceRecordId: string, reviewRecords: ReviewRecord[]): ReviewRecord | undefined => {
    return reviewRecords.find(r => r.id === sourceRecordId);
  };

  const updateDefectItem = (defect: DefectItem) => {
    setDefects(prev => ({ ...prev, [defect.id]: defect }));
  };

  return {
    defects,
    defectFormValues,
    activeDefectTab,
    isCreateDefectModalOpen,
    createDefectSourceRecord,
    createDefectPriority,
    createDefectExpectedTime,
    timeTick,
    defectStats,
    groupedDefects,
    setActiveDefectTab,
    setIsCreateDefectModalOpen,
    setCreateDefectSourceRecord,
    setCreateDefectPriority,
    setCreateDefectExpectedTime,
    setTimeTick,
    setDefectsFromData,
    loadDefects,
    handleDefectFormChange,
    handleDefectPriorityOrTimeSave,
    handleStartProcessing,
    handleCompleteDefect,
    handleRejectDefect,
    handleReopenDefect,
    handleDeleteDefect,
    handleGenerateDefectFromRecord,
    handleConfirmCreateDefect,
    handleCancelCreateDefect,
    getPriorityText,
    getPriorityBadgeClass,
    getDefaultDefectFormValues,
    getTimeStatus,
    isOverdue,
    isSoonOverdue,
    getDefectSourceRecord,
    updateDefectItem,
    getDefectStatusBadgeClass,
    getDefectStatusText
  };
}
