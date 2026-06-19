import { useState, useMemo } from "react";
import {
  TrainingComment,
  TrainingCommentState,
  TrainingCommentStatus,
  ReviewRecord,
  getAllTrainingComments,
  saveTrainingComment
} from "../db";

export type UserRole = "维修工程师" | "放行人员" | "培训教员";

export interface UseTrainingCommentsOptions {
  activeRole?: UserRole;
  networkStatus?: "online" | "offline";
  onOfflineSave?: (label: string) => void;
}

export function useTrainingComments(options: UseTrainingCommentsOptions = {}) {
  const { activeRole = "培训教员", networkStatus = "online", onOfflineSave } = options;

  const [trainingComments, setTrainingComments] = useState<TrainingCommentState>({});

  const loadTrainingComments = async () => {
    const data = await getAllTrainingComments();
    setTrainingComments(data);
  };

  const setTrainingCommentsFromData = (data: TrainingCommentState) => {
    setTrainingComments(data);
  };

  const showOfflineToast = (label: string) => {
    if (networkStatus === "offline" && onOfflineSave) {
      onOfflineSave(label);
    }
  };

  const handleTrainingCommentChange = async (recordId: string, comment: string) => {
    const now = Date.now();
    const existing = trainingComments[recordId];
    const newComment: TrainingComment = {
      id: existing?.id || `tc-${now}`,
      recordId,
      comment,
      trainer: activeRole,
      status: existing?.status || (comment.trim().length > 0 ? "已闭环" : "待讲评"),
      createdAt: existing?.createdAt || now,
      updatedAt: now
    };
    try {
      const versionedComment = await saveTrainingComment(newComment);
      setTrainingComments(prev => ({ ...prev, [recordId]: versionedComment }));
      showOfflineToast("培训讲评已暂存本地");
    } catch (error) {
      console.error("Failed to save training comment:", error);
    }
  };

  const handleTrainingCommentStatusChange = async (recordId: string, status: TrainingCommentStatus) => {
    const now = Date.now();
    const existing = trainingComments[recordId];
    const newComment: TrainingComment = {
      id: existing?.id || `tc-${now}`,
      recordId,
      comment: existing?.comment || "",
      trainer: activeRole,
      status,
      createdAt: existing?.createdAt || now,
      updatedAt: now
    };
    try {
      const versionedComment = await saveTrainingComment(newComment);
      setTrainingComments(prev => ({ ...prev, [recordId]: versionedComment }));
      showOfflineToast("培训讲评已暂存本地");
    } catch (error) {
      console.error("Failed to save training comment status:", error);
    }
  };

  const trainingCommentStats = useMemo(() => {
    return {
      getStats: (records: ReviewRecord[]) => {
        let pendingReview = 0;
        let needRetraining = 0;
        let closed = 0;
        records.forEach(r => {
          const comment = trainingComments[r.id];
          const status = comment?.status;
          if (status === "待讲评" || !status) {
            pendingReview++;
          } else if (status === "需复训") {
            needRetraining++;
          } else if (status === "已闭环") {
            closed++;
          }
        });
        return { pendingReview, needRetraining, closed };
      }
    };
  }, [trainingComments]);

  const updateTrainingComment = (comment: TrainingComment) => {
    setTrainingComments(prev => ({ ...prev, [comment.recordId]: comment }));
  };

  return {
    trainingComments,
    loadTrainingComments,
    setTrainingCommentsFromData,
    handleTrainingCommentChange,
    handleTrainingCommentStatusChange,
    trainingCommentStats,
    updateTrainingComment
  };
}
