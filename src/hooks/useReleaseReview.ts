import { useState, useMemo } from "react";
import {
  ReviewRecord,
  ReleaseReviewResult,
  ReleaseReviewState,
  ReviewState,
  StatusHistoryItem,
  saveReviewNote,
  getAllReleaseReviews,
  getAllReviewNotes,
  saveReleaseReview,
  updateRecord
} from "../db";
import { getStatusCategory, StatusCategory } from "../workflow";

export type UserRole = "维修工程师" | "放行人员" | "培训教员";

export interface UseReleaseReviewOptions {
  activeRole?: UserRole;
  networkStatus?: "online" | "offline";
  onOfflineSave?: (label: string) => void;
  onRecordStatusChange?: (
    recordId: string,
    fromStatus: string,
    toStatus: string,
    remark?: string
  ) => Promise<void>;
  onRecordUpdated?: (record: ReviewRecord) => void;
}

export function useReleaseReview(options: UseReleaseReviewOptions = {}) {
  const {
    activeRole = "放行人员",
    networkStatus = "online",
    onOfflineSave,
    onRecordStatusChange,
    onRecordUpdated
  } = options;

  const [releaseReviews, setReleaseReviews] = useState<ReleaseReviewState>({});
  const [reviewNotes, setReviewNotes] = useState<ReviewState>({});
  const [releaseOpinions, setReleaseOpinions] = useState<Record<string, string>>({});
  const [selectedRecordIds, setSelectedRecordIds] = useState<Set<string>>(new Set());
  const [batchOpinion, setBatchOpinion] = useState("");

  const loadReleaseReviews = async () => {
    const [notes, reviews] = await Promise.all([
      getAllReviewNotes(),
      getAllReleaseReviews()
    ]);
    setReviewNotes(notes);
    setReleaseReviews(reviews);
  };

  const setReleaseReviewsFromData = (data: ReleaseReviewState) => {
    setReleaseReviews(data);
  };

  const setReviewNotesFromData = (data: ReviewState) => {
    setReviewNotes(data);
  };

  const showOfflineToast = (label: string) => {
    if (networkStatus === "offline" && onOfflineSave) {
      onOfflineSave(label);
    }
  };

  const handleReviewNoteChange = async (recordId: string, value: string) => {
    setReviewNotes(prev => ({ ...prev, [recordId]: value }));
    try {
      await saveReviewNote(recordId, value);
      showOfflineToast("讲评备注已暂存本地");
    } catch (error) {
      console.error("Failed to save review note:", error);
    }
  };

  const handleReleaseOpinionChange = (recordId: string, value: string) => {
    setReleaseOpinions(prev => ({ ...prev, [recordId]: value }));
  };

  const handleReleaseReview = async (record: ReviewRecord, status: "passed" | "rejected") => {
    const opinion = releaseOpinions[record.id] || "";
    
    if (record.status.includes("缺陷") && opinion.trim() === "") {
      alert("缺陷项必须填写复核意见！请说明处置理由。");
      return;
    }

    const review: ReleaseReviewResult = {
      recordId: record.id,
      status,
      opinion,
      reviewer: "放行人员",
      reviewedAt: Date.now()
    };
    try {
      await saveReleaseReview(review);
      setReleaseReviews(prev => ({ ...prev, [record.id]: review }));
      
      const isDefect = record.status.includes("缺陷");
      let newStatus: string;
      if (status === "passed") {
        newStatus = isDefect ? "缺陷" : "正常";
      } else {
        newStatus = "待复核";
      }
      if (record.status !== newStatus || (opinion && opinion !== record.handling)) {
        const updatedRecord = { ...record, status: newStatus, handling: opinion || record.handling };
        const versionedRecord = await updateRecord(updatedRecord);
        if (onRecordUpdated) {
          onRecordUpdated(versionedRecord);
        }
        if (record.status !== newStatus && onRecordStatusChange) {
          await onRecordStatusChange(
            record.id,
            record.status,
            newStatus,
            status === "passed"
              ? (isDefect ? `带缺陷放行：${opinion || "无意见"}` : `放行通过：${opinion || "无意见"}`)
              : `驳回需返工：${opinion || "无意见"}`
          );
        }
      }
      
      setReleaseOpinions(prev => {
        const next = { ...prev };
        delete next[record.id];
        return next;
      });
    } catch (error) {
      console.error("Failed to save release review:", error);
    }
  };

  const handleToggleSelectRecord = (recordId: string) => {
    setSelectedRecordIds(prev => {
      const next = new Set(prev);
      if (next.has(recordId)) {
        next.delete(recordId);
      } else {
        next.add(recordId);
      }
      return next;
    });
  };

  const getPendingRecords = (records: ReviewRecord[]): ReviewRecord[] => {
    return records.filter(r => {
      const category = getStatusCategory(r.status);
      const isReviewed = !!releaseReviews[r.id];
      return category === "pending" && !isReviewed;
    });
  };

  const getDefectRecords = (records: ReviewRecord[]): ReviewRecord[] => {
    return records.filter(r => {
      const category = getStatusCategory(r.status);
      return category === "defect";
    });
  };

  const getNormalRecords = (records: ReviewRecord[]): ReviewRecord[] => {
    return records.filter(r => {
      const category = getStatusCategory(r.status);
      const isReviewed = !!releaseReviews[r.id];
      return category === "normal" || (category === "pending" && isReviewed);
    });
  };

  const handleToggleSelectAllPending = (pendingRecords: ReviewRecord[]) => {
    const pendingIds = pendingRecords.map(r => r.id);
    const allSelected = pendingIds.every(id => selectedRecordIds.has(id));
    if (allSelected) {
      setSelectedRecordIds(new Set());
    } else {
      setSelectedRecordIds(new Set(pendingIds));
    }
  };

  const handleBatchReview = async (pendingRecords: ReviewRecord[]) => {
    const selectedPending = pendingRecords.filter(r => selectedRecordIds.has(r.id));
    if (selectedPending.length === 0) {
      alert("请先选择要批量复核的待复核记录");
      return;
    }
    const confirmed = window.confirm(
      `确认批量通过 ${selectedPending.length} 条待复核记录？\n复核意见：${batchOpinion || "（无意见）"}`
    );
    if (!confirmed) return;
    try {
      const now = Date.now();
      const newReviews: ReleaseReviewResult[] = [];
      const updatedRecords: ReviewRecord[] = [];
      const historyItems: Array<{ recordId: string; fromStatus: string; toStatus: string; remark: string }> = [];
      for (const record of selectedPending) {
        const isDefect = record.status.includes("缺陷");
        const review: ReleaseReviewResult = {
          recordId: record.id,
          status: "passed",
          opinion: batchOpinion,
          reviewer: "放行人员",
          reviewedAt: now
        };
        newReviews.push(review);
        const newStatus = isDefect ? "缺陷" : "正常";
        if (record.status !== newStatus || (batchOpinion && batchOpinion !== record.handling)) {
          const updatedRecord = { ...record, status: newStatus, handling: batchOpinion || record.handling };
          updatedRecords.push(updatedRecord);
          if (record.status !== newStatus) {
            historyItems.push({
              recordId: record.id,
              fromStatus: record.status,
              toStatus: newStatus,
              remark: `批量放行通过：${batchOpinion || "无意见"}`
            });
          }
        }
      }
      for (const review of newReviews) {
        await saveReleaseReview(review);
      }
      const versionedRecords: ReviewRecord[] = [];
      for (const record of updatedRecords) {
        const versioned = await updateRecord(record);
        versionedRecords.push(versioned);
      }
      setReleaseReviews(prev => {
        const next = { ...prev };
        newReviews.forEach(r => { next[r.recordId] = r; });
        return next;
      });
      if (onRecordUpdated) {
        versionedRecords.forEach(ur => onRecordUpdated(ur));
      }
      if (onRecordStatusChange) {
        for (const item of historyItems) {
          await onRecordStatusChange(item.recordId, item.fromStatus, item.toStatus, item.remark);
        }
      }
      setSelectedRecordIds(new Set());
      setBatchOpinion("");
      alert(`已成功批量通过 ${selectedPending.length} 条记录`);
    } catch (error) {
      console.error("Failed to batch review:", error);
      alert("批量复核失败，请重试");
    }
  };

  const releaseStats = useMemo(() => {
    return {
      getStats: (records: ReviewRecord[]) => {
        let normal = 0;
        let pending = 0;
        let defect = 0;
        let reviewed = 0;
        let passed = 0;
        let rejected = 0;
        let defectReviewed = 0;

        records.forEach(r => {
          const review = releaseReviews[r.id];
          const isDefect = r.status.includes("缺陷");
          const isNormal = r.status.includes("正常") || r.status.includes("完成");
          const isPendingReview = r.status.includes("待复核");

          if (isDefect) {
            defect++;
            if (review) {
              reviewed++;
              defectReviewed++;
            }
          } else if (isNormal) {
            normal++;
            if (review) {
              reviewed++;
              if (review.status === "passed") {
                passed++;
              } else if (review.status === "rejected") {
                rejected++;
              }
            }
          } else if (isPendingReview) {
            pending++;
            if (review) {
              reviewed++;
              if (review.status === "passed") {
                passed++;
              } else if (review.status === "rejected") {
                rejected++;
              }
            }
          }
        });

        const totalPending = records.length - passed;

        return {
          total: records.length,
          normal,
          pending,
          defect,
          reviewed,
          passed,
          rejected,
          defectReviewed,
          totalPending
        };
      }
    };
  }, [releaseReviews]);

  const groupedRecords = useMemo(() => {
    return {
      getGrouped: (records: ReviewRecord[]) => {
        const normal: ReviewRecord[] = [];
        const pending: ReviewRecord[] = [];
        const defect: ReviewRecord[] = [];

        records.forEach(r => {
          if (r.status.includes("缺陷")) {
            defect.push(r);
          } else if (r.status.includes("待复核")) {
            pending.push(r);
          } else {
            normal.push(r);
          }
        });

        return { normal, pending, defect };
      }
    };
  }, []);

  const clearReleaseReview = (recordId: string) => {
    setReleaseReviews(prev => {
      const next = { ...prev };
      delete next[recordId];
      return next;
    });
  };

  return {
    releaseReviews,
    reviewNotes,
    releaseOpinions,
    selectedRecordIds,
    batchOpinion,
    setSelectedRecordIds,
    setBatchOpinion,
    setReleaseReviewsFromData,
    setReviewNotesFromData,
    loadReleaseReviews,
    handleReviewNoteChange,
    handleReleaseOpinionChange,
    handleReleaseReview,
    handleToggleSelectRecord,
    handleToggleSelectAllPending,
    handleBatchReview,
    getPendingRecords,
    getDefectRecords,
    getNormalRecords,
    releaseStats,
    groupedRecords,
    clearReleaseReview
  };
}
