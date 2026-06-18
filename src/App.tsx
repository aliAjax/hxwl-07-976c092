import { useState, useMemo, useEffect, useRef } from "react";
import "./styles.css";
import {
  CheckTemplate,
  ReviewRecord,
  ReviewState,
  ReleaseReviewResult,
  ReleaseReviewState,
  DefectItem,
  DefectState,
  StatusHistoryItem,
  StatusHistoryState,
  TrainingComment,
  TrainingCommentState,
  UserRole as DBUserRole,
  initializeDatabase,
  addTemplate,
  updateTemplate,
  deleteTemplate as dbDeleteTemplate,
  addRecord,
  updateRecord,
  saveReviewNote,
  getAllTemplates,
  getAllRecords,
  getAllReviewNotes,
  getAllReleaseReviews,
  saveReleaseReview,
  getAllDefects,
  updateDefect,
  createDefectFromRecord,
  deleteDefect,
  addStatusHistory,
  saveTrainingComment,
  getAllStatusHistory,
  getAllTrainingComments
} from "./db";
import {
  WorkflowConfig,
  FieldConfig,
  findWorkflowConfig,
  getStatusBadgeClass,
  getDefectStatusBadgeClass,
  getDefectStatusText,
  getAllAircraftTypes,
  getAtaChaptersByAircraft,
  getCheckAreasByAircraftAndAta,
  canRoleEditField,
  getAvailableStatusTransitions,
  validateRequiredFields,
  calculateMetricValue,
  getMatrixCellStatus,
  getRecordDisplayFields,
  canCreateDefect,
  getInitialStatus,
  StatusCategory,
  getRoleVisibleFields,
  canRolePerformAction,
  getRoleEditableFields,
  getRoleSpecificMetrics,
  getRoleDescription
} from "./workflow";
import {
  workflowConfigs,
  getGlobalMetrics,
  getGlobalFilters
} from "./workflowConfigs";
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
  clearSyncedOperations,
  getSWStatusText,
  getCacheInfo,
  clearCache,
  precacheAssets,
  updateServiceWorker,
  activateWaitingWorker
} from "./offline";

type UserRole = "维修工程师" | "放行人员" | "培训教员";

const project = {
  "id": "hxwl-07",
  "port": 5107,
  "title": "航空维修检查清单",
  "subtitle": "按ATA章节推进维修放行前检查",
  "stack": "React + Vite + TypeScript + CSS",
  "theme": [
    "#1d4ed8",
    "#475569",
    "#f97316"
  ],
  "domain": "航空维修",
  "users": [
    "维修工程师",
    "放行人员",
    "培训教员"
  ] as UserRole[]
};

type TemplateFormValues = Omit<CheckTemplate, "id">;

interface FormValues {
  aircraftType: string;
  ataChapter: string;
  checkArea: string;
  checkItem: string;
  defectDesc: string;
  handling: string;
  signer: string;
  status: string;
}

const emptyForm: FormValues = {
  aircraftType: "",
  ataChapter: "",
  checkArea: "",
  checkItem: "",
  defectDesc: "",
  handling: "",
  signer: "",
  status: "待复核"
};

const statusColors = ["status-ok", "status-watch", "status-danger"];

function MetricCard({ label, value, index }: { label: string; value: string; index: number }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <i className={statusColors[index % statusColors.length]} />
    </article>
  );
}

function ReleaseReviewCard({
  record,
  index,
  review,
  opinion,
  onOpinionChange,
  onReview,
  recordType,
  history,
  showHistory,
  onToggleHistory
}: {
  record: ReviewRecord;
  index: number;
  review?: ReleaseReviewResult;
  opinion: string;
  onOpinionChange: (id: string, value: string) => void;
  onReview: (id: string, status: "passed" | "rejected") => void;
  recordType: "normal" | "pending" | "defect";
  history?: StatusHistoryItem[];
  showHistory?: boolean;
  onToggleHistory?: (id: string) => void;
}) {
  const isReviewed = !!review;
  const isPassed = review?.status === "passed";
  const isRejected = review?.status === "rejected";
  const isDefectType = recordType === "defect";

  const getReviewBadge = () => {
    if (isDefectType && isReviewed) {
      return <span className="review-badge review-badge-defect-reviewed">已复核·缺陷</span>;
    }
    if (isPassed) return <span className="review-badge review-badge-pass">已通过</span>;
    if (isRejected) return <span className="review-badge review-badge-reject">已驳回</span>;
    return <span className="review-badge review-badge-pending">待复核</span>;
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  const handlePassClick = () => {
    if (isDefectType) {
      const confirmed = window.confirm(
        "注意：该记录为缺陷项，确认通过后仍将标记为缺陷，不计入已完成。\n\n是否确认通过复核？"
      );
      if (confirmed) {
        onReview(record.id, "passed");
      }
    } else {
      onReview(record.id, "passed");
    }
  };

  const handleRejectClick = () => {
    if (isDefectType) {
      const confirmed = window.confirm(
        "确认驳回该缺陷项？驳回后需重新提交复核。"
      );
      if (confirmed) {
        onReview(record.id, "rejected");
      }
    } else {
      onReview(record.id, "rejected");
    }
  };

  return (
    <article className={`release-card ${isReviewed ? "reviewed" : ""} ${isPassed ? "passed" : ""} ${isRejected ? "rejected" : ""} ${isDefectType ? "defect-record" : ""}`}>
      <div className="release-card-header">
        <div className={`release-card-index ${isDefectType ? "defect-index" : ""}`}>
          {String(index + 1).padStart(2, "0")}
        </div>
        <div className="release-card-title">
          <div className="release-card-top">
            <h3>{record.aircraftType}</h3>
            <span className={`status-badge ${getStatusBadgeClass(record.status)}`}>
              {record.status}
            </span>
            {getReviewBadge()}
            {isDefectType && !isReviewed && (
              <span className="defect-warning-tag">⚠️ 需谨慎处理</span>
            )}
            {onToggleHistory && (
              <button
                className="history-btn"
                onClick={() => onToggleHistory(record.id)}
              >
                📋 状态历史 ({history?.length || 0})
              </button>
            )}
          </div>
          <div className="release-card-meta">
            <span className="meta-tag">{record.ataChapter}</span>
            <span className="meta-tag meta-tag-muted">{record.checkArea}</span>
            {record.checkItem && <span className="meta-tag meta-tag-muted">{record.checkItem}</span>}
          </div>
        </div>
      </div>

      {showHistory && history && history.length > 0 && (
        <div className="history-timeline">
          <div className="section-label">状态变更历史</div>
          {history.map((item) => (
            <div key={item.id} className="history-timeline-item">
              <div className="history-dot"></div>
              <div className="history-content">
                <div className="history-header">
                  <span className="history-status-from">{item.fromStatus}</span>
                  <span className="history-arrow">→</span>
                  <span className="history-status-to">{item.toStatus}</span>
                  <span className="history-operator">{item.operatorRole}</span>
                  <span className="history-time">{formatTime(item.changedAt)}</span>
                </div>
                {item.remark && <div className="history-remark">{item.remark}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="release-card-body">
        <div className="defect-section">
          <div className="section-label">
            {isDefectType ? "缺陷详情" : "检查说明"}
          </div>
          <div className={`defect-content ${isDefectType ? "defect-highlight" : ""}`}>
            {record.defectDesc ? record.defectDesc : "无缺陷描述"}
          </div>
        </div>

        {record.handling && (
          <div className="handling-section">
            <div className="section-label">处理意见</div>
            <div className="handling-content">
              {record.handling}
            </div>
          </div>
        )}

        {isReviewed ? (
          <div className="review-result-section">
            <div className="section-label">
              复核意见
              <span className="reviewer-info">
                {review?.reviewer} · {formatTime(review!.reviewedAt)}
              </span>
            </div>
            <div className={`review-opinion-display ${isDefectType ? "defect-opinion" : ""}`}>
              {review?.opinion || "无复核意见"}
            </div>
            {isDefectType && (
              <div className="defect-status-note">
                <span className="defect-status-icon">⚠️</span>
                <span>缺陷项不计入已完成，需持续跟踪处理</span>
              </div>
            )}
          </div>
        ) : (
          <div className="review-action-section">
            <div className="section-label">
              复核意见
              {isDefectType && <span className="defect-required-tag">必填</span>}
            </div>
            <textarea
              className={`opinion-textarea ${isDefectType ? "defect-textarea" : ""}`}
              placeholder={isDefectType ? "请填写缺陷处置意见，是否同意放行，需说明理由..." : "请填写复核意见..."}
              rows={isDefectType ? 3 : 2}
              value={opinion}
              onChange={e => onOpinionChange(record.id, e.target.value)}
            />
            <div className="review-actions-row">
              <button
                className="reject-btn"
                onClick={handleRejectClick}
              >
                {isDefectType ? "驳回·需返工" : "驳回"}
              </button>
              <button
                className={`pass-btn ${isDefectType ? "defect-pass-btn" : ""}`}
                onClick={handlePassClick}
              >
                {isDefectType ? "通过·带缺陷放行" : "通过"}
              </button>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}



interface DefectCardProps {
  defect: DefectItem;
  index: number;
  formValues: { handlingOpinion: string; assignedSigner: string; rejectedReason: string; completedNote: string };
  sourceRecord?: ReviewRecord;
  onFormChange: (defectId: string, field: string, value: string) => void;
  onStartProcessing: (defectId: string) => void;
  onComplete: (defectId: string) => void;
  onReject: (defectId: string, reason?: string) => void;
  onReopen: (defectId: string) => void;
  onDelete: (defectId: string) => void;
  isHistory?: boolean;
}

function DefectCard({
  defect,
  index,
  formValues,
  sourceRecord,
  onFormChange,
  onStartProcessing,
  onComplete,
  onReject,
  onReopen,
  onDelete,
  isHistory = false
}: DefectCardProps) {
  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  const isPending = defect.status === "pending";
  const isProcessing = defect.status === "processing";
  const isCompleted = defect.status === "completed";
  const isRejected = defect.status === "rejected";

  return (
    <article className={`defect-card defect-card-${defect.status} ${isHistory ? "defect-card-history" : ""}`}>
      <div className="defect-card-header">
        <div className={`defect-card-index ${isPending ? "defect-index-pending" : isProcessing ? "defect-index-processing" : isCompleted ? "defect-index-completed" : "defect-index-rejected"}`}>
          {String(index + 1).padStart(2, "0")}
        </div>
        <div className="defect-card-title">
          <div className="defect-card-top">
            <h3>{defect.aircraftType}</h3>
            <span className={`defect-status-badge ${getDefectStatusBadgeClass(defect.status)}`}>
              {getDefectStatusText(defect.status)}
            </span>
            {sourceRecord && (
              <span className="defect-source-tag">源自检查记录</span>
            )}
          </div>
          <div className="defect-card-meta">
            <span className="meta-tag">{defect.ataChapter}</span>
            <span className="meta-tag meta-tag-muted">{defect.checkArea}</span>
            {defect.checkItem && <span className="meta-tag meta-tag-muted">{defect.checkItem}</span>}
          </div>
          <div className="defect-card-time">
            创建时间：{formatTime(defect.createdAt)}
          </div>
        </div>
        {!isHistory && (
          <button className="defect-delete-btn" onClick={() => onDelete(defect.id)} title="删除">
            ×
          </button>
        )}
      </div>

      <div className="defect-card-body">
        <div className="defect-section">
          <div className="section-label">缺陷描述</div>
          <div className="defect-content defect-highlight">
            {defect.defectDesc}
          </div>
        </div>

        {defect.handlingOpinion && (
          <div className="handling-section">
            <div className="section-label">处理意见</div>
            <div className="handling-content">
              {defect.handlingOpinion}
            </div>
          </div>
        )}

        {defect.assignedSigner && (
          <div className="signer-section">
            <div className="section-label">指定签署人</div>
            <div className="signer-content">
              {defect.assignedSigner}
            </div>
          </div>
        )}

        {isCompleted && (
          <div className="defect-result-section">
            <div className="section-label">
              完成说明
              <span className="reviewer-info">
                {formatTime(defect.completedAt!)}
              </span>
            </div>
            <div className="defect-result-content">
              {defect.completedNote || "无补充说明"}
            </div>
          </div>
        )}

        {isRejected && (
          <div className="defect-result-section">
            <div className="section-label">
              退回原因
              <span className="reviewer-info">
                {formatTime(defect.rejectedAt!)}
              </span>
            </div>
            <div className="defect-reject-content">
              {defect.rejectedReason}
            </div>
          </div>
        )}

        {isPending && !isHistory && (
          <div className="defect-action-section">
            <div className="defect-form-grid">
              <label className="full-width">
                <span>处理意见 <span className="required-mark">*</span></span>
                <textarea
                  className="defect-textarea"
                  placeholder="请填写具体的维修处理意见，包括维修方案、预计工时、所需器材等..."
                  rows={2}
                  value={formValues.handlingOpinion || defect.handlingOpinion}
                  onChange={e => onFormChange(defect.id, "handlingOpinion", e.target.value)}
                />
              </label>
              <label className="full-width">
                <span>指定签署人 <span className="required-mark">*</span></span>
                <input
                  className="defect-input"
                  placeholder="请指定负责该缺陷处理的签署人"
                  value={formValues.assignedSigner || defect.assignedSigner}
                  onChange={e => onFormChange(defect.id, "assignedSigner", e.target.value)}
                />
              </label>
            </div>
            <div className="defect-actions-row">
              <button
                className="defect-start-btn"
                onClick={() => onStartProcessing(defect.id)}
              >
                开始处理
              </button>
            </div>
          </div>
        )}

        {isProcessing && !isHistory && (
          <div className="defect-action-section">
            <label className="full-width">
              <span>完成说明</span>
              <textarea
                className="defect-textarea"
                placeholder="请填写维修完成情况说明（可选）..."
                rows={2}
                value={formValues.completedNote || ""}
                onChange={e => onFormChange(defect.id, "completedNote", e.target.value)}
              />
            </label>
            <label className="full-width">
              <span>退回原因</span>
              <textarea
                className="defect-textarea"
                placeholder="请填写退回复核原因..."
                rows={2}
                value={formValues.rejectedReason || ""}
                onChange={e => onFormChange(defect.id, "rejectedReason", e.target.value)}
              />
            </label>
            <div className="defect-actions-row">
              <button
                className="defect-reject-btn"
                onClick={() => onReject(defect.id)}
              >
                退回复核
              </button>
              <button
                className="defect-complete-btn"
                onClick={() => onComplete(defect.id)}
              >
                标记完成
              </button>
            </div>
          </div>
        )}

        {isHistory && (
          <div className="defect-history-actions">
            <button
              className="defect-reopen-btn"
              onClick={() => onReopen(defect.id)}
            >
              重新打开
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

function DynamicFormField({
  field,
  value,
  onChange,
  disabled = false
}: {
  field: FieldConfig;
  value: string;
  onChange: (key: string, value: string) => void;
  disabled?: boolean;
}) {
  const baseClassName = field.fullWidth ? "full-width" : "";

  if (field.type === "select") {
    return (
      <label className={baseClassName}>
        <span>
          {field.label}
          {field.required && <span className="required-mark">*</span>}
        </span>
        <select
          value={value}
          onChange={e => onChange(field.key, e.target.value)}
          disabled={disabled}
          className={disabled ? "disabled-input" : ""}
        >
          <option value="">{field.placeholder || `请选择${field.label}`}</option>
          {field.options?.map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </label>
    );
  }

  if (field.type === "textarea") {
    return (
      <label className={baseClassName}>
        <span>
          {field.label}
          {field.required && <span className="required-mark">*</span>}
        </span>
        <textarea
          placeholder={field.placeholder}
          value={value}
          onChange={e => onChange(field.key, e.target.value)}
          disabled={disabled}
          rows={3}
          className={disabled ? "disabled-input" : ""}
        />
      </label>
    );
  }

  return (
    <label className={baseClassName}>
      <span>
        {field.label}
        {field.required && <span className="required-mark">*</span>}
      </span>
      <input
        type="text"
        placeholder={field.placeholder}
        value={value}
        onChange={e => onChange(field.key, e.target.value)}
        disabled={disabled}
        className={disabled ? "disabled-input" : ""}
      />
    </label>
  );
}

function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [templates, setTemplates] = useState<CheckTemplate[]>([]);
  const [reviewRecords, setReviewRecords] = useState<ReviewRecord[]>([]);
  const [reviewNotes, setReviewNotes] = useState<ReviewState>({});
  const [releaseReviews, setReleaseReviews] = useState<ReleaseReviewState>({});
  const [defects, setDefects] = useState<DefectState>({});
  const [statusHistory, setStatusHistory] = useState<StatusHistoryState>({});
  const [trainingComments, setTrainingComments] = useState<TrainingCommentState>({});
  const [activeHistoryRecordId, setActiveHistoryRecordId] = useState<string | null>(null);
  const [activeDefectTab, setActiveDefectTab] = useState<"pending" | "history">("pending");
  const [defectFormValues, setDefectFormValues] = useState<Record<string, { handlingOpinion: string; assignedSigner: string; rejectedReason: string; completedNote: string }>>({});
  const [formValues, setFormValues] = useState<FormValues>(emptyForm);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<CheckTemplate | null>(null);
  const [isTemplateFromRecord, setIsTemplateFromRecord] = useState(false);
  const [templateForm, setTemplateForm] = useState<TemplateFormValues>({
    name: "",
    aircraftType: "",
    ataChapter: "",
    checkArea: "",
    checkItem: "",
    defectDesc: "",
    handling: "",
    signer: ""
  });
  const [activeRole, setActiveRole] = useState<UserRole>("维修工程师");
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  interface RecordFilterState {
    aircraftType: string;
    ataChapter: string;
    status: string;
    hasReleaseReview: "" | "yes" | "no";
  }

  const emptyRecordFilter: RecordFilterState = {
    aircraftType: "",
    ataChapter: "",
    status: "",
    hasReleaseReview: ""
  };

  const [recordFilters, setRecordFilters] = useState<RecordFilterState>(emptyRecordFilter);
  const [isExportPreviewOpen, setIsExportPreviewOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "success" | "failed">("idle");
  const [isMatrixDetailOpen, setIsMatrixDetailOpen] = useState(false);
  const [matrixDetailData, setMatrixDetailData] = useState<{
    aircraftType: string;
    ataChapter: string;
    records: ReviewRecord[];
  } | null>(null);
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>(navigator.onLine ? "online" : "offline");
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [syncQueue, setSyncQueue] = useState<SyncOperation[]>([]);
  const [showSyncPanel, setShowSyncPanel] = useState(false);
  const [showOnlineRestoredToast, setShowOnlineRestoredToast] = useState(false);
  const [cacheReady, setCacheReady] = useState(false);
  const [swStatus, setSwStatus] = useState<SWStatus | null>(null);
  const [showCachePanel, setShowCachePanel] = useState(false);
  const prevNetworkRef = useRef<NetworkStatus>(navigator.onLine ? "online" : "offline");
  const toastTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        const data = await initializeDatabase();
        setTemplates(data.templates);
        setReviewRecords(data.records);
        setReviewNotes(data.reviewNotes);
        setReleaseReviews(data.releaseReviews);
        setDefects(data.defects);
        setStatusHistory(data.statusHistory);
        setTrainingComments(data.trainingComments);
        setCacheReady(isStaticCacheAvailable());
      } catch (error) {
        console.error("Failed to initialize database:", error);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();

    const cleanupNetwork = initNetworkMonitoring();
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
    getCacheInfo();

    return () => {
      cleanupNetwork();
      unsubscribeNetwork();
      unsubscribeSyncQueue();
      unsubscribeSyncStatus();
      unsubscribeSWStatus();
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  const refreshData = async () => {
    try {
      const [t, r, n, rr, d, sh, tc] = await Promise.all([
        getAllTemplates(),
        getAllRecords(),
        getAllReviewNotes(),
        getAllReleaseReviews(),
        getAllDefects(),
        getAllStatusHistory(),
        getAllTrainingComments()
      ]);
      setTemplates(t);
      setReviewRecords(r);
      setReviewNotes(n);
      setReleaseReviews(rr);
      setDefects(d);
      setStatusHistory(sh);
      setTrainingComments(tc);
    } catch (error) {
      console.error("Failed to refresh data:", error);
    }
  };

  const recordStatusChange = async (
    recordId: string,
    fromStatus: string,
    toStatus: string,
    remark?: string,
    fieldChanges?: Record<string, { oldValue: string; newValue: string }>
  ) => {
    if (fromStatus === toStatus) return;
    const historyItem: StatusHistoryItem = {
      id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      recordId,
      fromStatus,
      toStatus,
      operatorRole: activeRole as DBUserRole,
      operatorName: activeRole,
      changedAt: Date.now(),
      remark,
      fieldChanges
    };
    try {
      await addStatusHistory(historyItem);
      setStatusHistory(prev => {
        const next = { ...prev };
        if (!next[recordId]) {
          next[recordId] = [];
        }
        next[recordId] = [historyItem, ...next[recordId]];
        return next;
      });
    } catch (error) {
      console.error("Failed to record status history:", error);
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
      createdAt: existing?.createdAt || now,
      updatedAt: now
    };
    try {
      await saveTrainingComment(newComment);
      setTrainingComments(prev => ({ ...prev, [recordId]: newComment }));
    } catch (error) {
      console.error("Failed to save training comment:", error);
    }
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

  const currentWorkflowConfig = useMemo(() => {
    if (formValues.aircraftType && formValues.ataChapter && formValues.checkArea) {
      return findWorkflowConfig(workflowConfigs, formValues.aircraftType, formValues.ataChapter, formValues.checkArea);
    }
    return workflowConfigs[0];
  }, [formValues.aircraftType, formValues.ataChapter, formValues.checkArea]);

  const availableAircraftTypes = useMemo(() => getAllAircraftTypes(workflowConfigs), []);
  const availableAtaChapters = useMemo(
    () => formValues.aircraftType ? getAtaChaptersByAircraft(workflowConfigs, formValues.aircraftType) : [],
    [formValues.aircraftType]
  );
  const availableCheckAreas = useMemo(
    () => formValues.aircraftType && formValues.ataChapter
      ? getCheckAreasByAircraftAndAta(workflowConfigs, formValues.aircraftType, formValues.ataChapter)
      : [],
    [formValues.aircraftType, formValues.ataChapter]
  );

  const globalMetrics = useMemo(() => getGlobalMetrics(), []);
  const globalFilters = useMemo(() => getGlobalFilters(), []);
  const baseMetrics = currentWorkflowConfig?.metrics ?? globalMetrics;
  const activeMetrics = useMemo(() => getRoleSpecificMetrics(baseMetrics, activeRole), [baseMetrics, activeRole]);
  const activeFilters = currentWorkflowConfig?.filters ?? globalFilters;

  const allowedStatusOptions = useMemo(() => {
    const initialStatus = getInitialStatus(currentWorkflowConfig);
    if (!currentWorkflowConfig) return [initialStatus];
    const transitionTargets = getAvailableStatusTransitions(
      currentWorkflowConfig,
      initialStatus,
      activeRole
    ).map(transition => transition.to);
    return Array.from(new Set([initialStatus, ...transitionTargets]));
  }, [currentWorkflowConfig, activeRole]);

  useEffect(() => {
    const initialStatus = getInitialStatus(currentWorkflowConfig);
    setFormValues(prev => (
      allowedStatusOptions.includes(prev.status)
        ? prev
        : { ...prev, status: initialStatus }
    ));
  }, [currentWorkflowConfig, allowedStatusOptions]);

  useEffect(() => {
    if (activeFilter && !activeFilters.some(filter => filter.key === activeFilter)) {
      setActiveFilter(null);
    }
  }, [activeFilter, activeFilters]);

  useEffect(() => {
    setRecordFilters(prev => {
      let changed = false;
      const next = { ...prev };

      if (next.aircraftType && !availableAircraftTypeOptions.includes(next.aircraftType)) {
        next.aircraftType = "";
        changed = true;
      }

      if (next.ataChapter && !availableAtaChapterOptions.includes(next.ataChapter)) {
        next.ataChapter = "";
        changed = true;
      }

      if (next.status && !availableStatusOptions.includes(next.status)) {
        next.status = "";
        changed = true;
      }

      return changed ? next : prev;
    });
  }, [availableAircraftTypeOptions, availableAtaChapterOptions, availableStatusOptions]);

  const getFormFieldValue = (key: string): string => {
    const formAny = formValues as any;
    return formAny[key] || "";
  };

  const handleFormFieldChange = (key: string, value: string) => {
    setFormValues(prev => {
      const next = { ...prev } as any;
      next[key] = value;
      if (key === "aircraftType") {
        next.ataChapter = "";
        next.checkArea = "";
      } else if (key === "ataChapter") {
        next.checkArea = "";
      }
      return next;
    });
  };

  const getVisibleFields = (config: WorkflowConfig | undefined): FieldConfig[] => {
    return getRoleVisibleFields(config, activeRole);
  };

  const availableAircraftTypeOptions = useMemo(() => {
    const types = new Set<string>();
    reviewRecords.forEach(r => types.add(r.aircraftType));
    return Array.from(types).sort();
  }, [reviewRecords]);

  const availableAtaChapterOptions = useMemo(() => {
    const chapters = new Set<string>();
    reviewRecords
      .filter(r => !recordFilters.aircraftType || r.aircraftType === recordFilters.aircraftType)
      .forEach(r => chapters.add(r.ataChapter));
    return Array.from(chapters).sort();
  }, [reviewRecords, recordFilters.aircraftType]);

  const availableStatusOptions = useMemo(() => {
    const statuses = new Set<string>();
    reviewRecords.forEach(r => statuses.add(r.status));
    return Array.from(statuses).sort();
  }, [reviewRecords]);

  const filteredRecords = useMemo(() => {
    let result = reviewRecords;

    if (activeFilter) {
      const selectedFilter = activeFilters.find(filter => filter.key === activeFilter);
      if (selectedFilter) {
        result = result.filter(record => {
          const value = String((record as any)[selectedFilter.matchField] ?? "");
          return value === selectedFilter.label;
        });
      }
    }

    if (recordFilters.aircraftType) {
      result = result.filter(r => r.aircraftType === recordFilters.aircraftType);
    }

    if (recordFilters.ataChapter) {
      result = result.filter(r => r.ataChapter === recordFilters.ataChapter);
    }

    if (recordFilters.status) {
      result = result.filter(r => r.status === recordFilters.status);
    }

    if (recordFilters.hasReleaseReview === "yes") {
      result = result.filter(r => !!releaseReviews[r.id]);
    } else if (recordFilters.hasReleaseReview === "no") {
      result = result.filter(r => !releaseReviews[r.id]);
    }

    return result;
  }, [reviewRecords, activeFilter, activeFilters, recordFilters, releaseReviews]);

  const handleRecordFilterChange = (key: keyof RecordFilterState, value: string) => {
    setRecordFilters(prev => {
      const next = { ...prev, [key]: value };
      if (key === "aircraftType") {
        next.ataChapter = "";
      }
      return next;
    });
  };

  const resetRecordFilters = () => {
    setRecordFilters(emptyRecordFilter);
    setActiveFilter(null);
  };

  const metricValues = useMemo(() => {
    return activeMetrics.map(metric => {
      if (metric.key === "completionRate") {
        const completedCount = reviewRecords.filter(r => {
          if (r.status.includes("缺陷")) return false;
          const review = releaseReviews[r.id];
          return review && review.status === "passed";
        }).length;
        const total = reviewRecords.length;
        return {
          ...metric,
          value: total > 0 ? `${Math.round((completedCount / total) * 100)}%` : "0%"
        };
      }
      if (metric.key === "myRecords") {
        return { ...metric, value: String(reviewRecords.length) };
      }
      if (metric.key === "reviewedToday") {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayReviewed = Object.values(releaseReviews).filter(
          r => r.reviewedAt >= todayStart.getTime()
        ).length;
        return { ...metric, value: String(todayReviewed) };
      }
      if (metric.key === "commented") {
        const commentedCount = Object.values(trainingComments).filter(
          c => c.comment && c.comment.trim().length > 0
        ).length;
        return { ...metric, value: String(commentedCount) };
      }
      if (metric.key === "pendingComment") {
        const pendingCount = reviewRecords.filter(
          r => !trainingComments[r.id] || !trainingComments[r.id].comment?.trim()
        ).length;
        return { ...metric, value: String(pendingCount) };
      }
      return {
        ...metric,
        value: calculateMetricValue(metric, reviewRecords, defects, releaseReviews)
      };
    });
  }, [activeMetrics, reviewRecords, releaseReviews, defects, trainingComments]);

  const reviewStats = useMemo(() => {
    const total = filteredRecords.length;
    let defect = 0;
    let pending = 0;
    let normal = 0;
    let commented = 0;
    filteredRecords.forEach(r => {
      if (r.status.includes("缺陷")) defect++;
      else if (r.status.includes("待复核")) pending++;
      else normal++;
      if (reviewNotes[r.id] && reviewNotes[r.id].trim().length > 0) commented++;
    });
    return { total, defect, pending, normal, commented };
  }, [filteredRecords, reviewNotes]);

  const handleReviewNoteChange = async (recordId: string, value: string) => {
    setReviewNotes(prev => ({ ...prev, [recordId]: value }));
    try {
      await saveReviewNote(recordId, value);
    } catch (error) {
      console.error("Failed to save review note:", error);
    }
  };

  const [releaseOpinions, setReleaseOpinions] = useState<Record<string, string>>({});

  const handleReleaseOpinionChange = (recordId: string, value: string) => {
    setReleaseOpinions(prev => ({ ...prev, [recordId]: value }));
  };

  const handleReleaseReview = async (recordId: string, status: "passed" | "rejected") => {
    const record = reviewRecords.find(r => r.id === recordId);
    if (!record) return;
    const opinion = releaseOpinions[recordId] || "";
    
    if (record.status.includes("缺陷") && opinion.trim() === "") {
      alert("缺陷项必须填写复核意见！请说明处置理由。");
      return;
    }

    const review: ReleaseReviewResult = {
      recordId,
      status,
      opinion,
      reviewer: "放行人员",
      reviewedAt: Date.now()
    };
    try {
      await saveReleaseReview(review);
      setReleaseReviews(prev => ({ ...prev, [recordId]: review }));
      
      const isDefect = record.status.includes("缺陷");
      let newStatus: string;
      if (status === "passed") {
        newStatus = isDefect ? "缺陷" : "正常";
      } else {
        newStatus = "待复核";
      }
      if (record.status !== newStatus || (opinion && opinion !== record.handling)) {
        const updatedRecord = { ...record, status: newStatus, handling: opinion || record.handling };
        await updateRecord(updatedRecord);
        setReviewRecords(prev => prev.map(r => r.id === recordId ? updatedRecord : r));
        if (record.status !== newStatus) {
          await recordStatusChange(
            recordId,
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
        delete next[recordId];
        return next;
      });
    } catch (error) {
      console.error("Failed to save release review:", error);
    }
  };

  const handleGenerateDefectFromRecord = async (record: ReviewRecord) => {
    const existingDefect = Object.values(defects).find(d => d.sourceRecordId === record.id);
    if (existingDefect) {
      alert("该缺陷项已存在于待处理清单中！");
      return;
    }
    try {
      const defect = await createDefectFromRecord(record);
      setDefects(prev => ({ ...prev, [defect.id]: defect }));
      alert("缺陷项已添加到待处理清单！");
    } catch (error) {
      console.error("Failed to generate defect from record:", error);
      alert("生成缺陷项失败，请重试。");
    }
  };

  const handleDefectFormChange = (defectId: string, field: string, value: string) => {
    setDefectFormValues(prev => ({
      ...prev,
      [defectId]: {
        handlingOpinion: prev[defectId]?.handlingOpinion || "",
        assignedSigner: prev[defectId]?.assignedSigner || "",
        rejectedReason: prev[defectId]?.rejectedReason || "",
        completedNote: prev[defectId]?.completedNote || "",
        ...prev[defectId],
        [field]: value
      }
    }));
  };

  const handleStartProcessing = async (defectId: string) => {
    const defect = defects[defectId];
    if (!defect) return;

    const formVals = defectFormValues[defectId] || {};
    const handlingOpinion = formVals.handlingOpinion || defect.handlingOpinion;
    const assignedSigner = formVals.assignedSigner || defect.assignedSigner;

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
      status: "processing",
      updatedAt: Date.now()
    };

    try {
      await updateDefect(updatedDefect);
      setDefects(prev => ({ ...prev, [defectId]: updatedDefect }));
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
      await updateDefect(updatedDefect);
      setDefects(prev => ({ ...prev, [defectId]: updatedDefect }));
      setDefectFormValues(prev => {
        const next = { ...prev };
        delete next[defectId];
        return next;
      });
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
      await updateDefect(updatedDefect);
      setDefects(prev => ({ ...prev, [defectId]: updatedDefect }));
      setDefectFormValues(prev => {
        const next = { ...prev };
        delete next[defectId];
        return next;
      });
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
      await updateDefect(updatedDefect);
      setDefects(prev => ({ ...prev, [defectId]: updatedDefect }));
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

  const defectStats = useMemo(() => {
    const allDefects = Object.values(defects);
    const pending = allDefects.filter(d => d.status === "pending").length;
    const processing = allDefects.filter(d => d.status === "processing").length;
    const completed = allDefects.filter(d => d.status === "completed").length;
    const rejected = allDefects.filter(d => d.status === "rejected").length;
    return { total: allDefects.length, pending, processing, completed, rejected };
  }, [defects]);

  const groupedDefects = useMemo(() => {
    const allDefects = Object.values(defects);
    const pending = allDefects.filter(d => d.status === "pending" || d.status === "processing");
    const history = allDefects.filter(d => d.status === "completed" || d.status === "rejected");
    return { pending, history };
  }, [defects]);

  const getDefectSourceRecord = (sourceRecordId: string): ReviewRecord | undefined => {
    return reviewRecords.find(r => r.id === sourceRecordId);
  };

  const releaseStats = useMemo(() => {
    let normal = 0;
    let pending = 0;
    let defect = 0;
    let reviewed = 0;
    let passed = 0;
    let rejected = 0;
    let defectReviewed = 0;

    filteredRecords.forEach(r => {
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

    const totalPending = filteredRecords.length - passed;

    return {
      total: filteredRecords.length,
      normal,
      pending,
      defect,
      reviewed,
      passed,
      rejected,
      defectReviewed,
      totalPending
    };
  }, [filteredRecords, releaseReviews]);

  const groupedRecords = useMemo(() => {
    const normal: ReviewRecord[] = [];
    const pending: ReviewRecord[] = [];
    const defect: ReviewRecord[] = [];

    filteredRecords.forEach(r => {
      if (r.status.includes("缺陷")) {
        defect.push(r);
      } else if (r.status.includes("待复核")) {
        pending.push(r);
      } else {
        normal.push(r);
      }
    });

    return { normal, pending, defect };
  }, [filteredRecords]);

  const matrixData = useMemo(() => {
    const aircraftTypes = Array.from(new Set(reviewRecords.map(r => r.aircraftType))).sort();
    const ataChapters = Array.from(new Set(reviewRecords.map(r => r.ataChapter))).sort();
    
    const matrix: Record<string, Record<string, ReviewRecord[]>> = {};
    
    aircraftTypes.forEach(aircraft => {
      matrix[aircraft] = {};
      ataChapters.forEach(chapter => {
        matrix[aircraft][chapter] = filteredRecords.filter(
          r => r.aircraftType === aircraft && r.ataChapter === chapter
        );
      });
    });

    return { aircraftTypes, ataChapters, matrix };
  }, [reviewRecords, filteredRecords]);

  const getCellStatus = (records: ReviewRecord[]): StatusCategory | "not-started" => {
    if (records.length === 0) return "not-started";
    const allStatuses = workflowConfigs.flatMap(c => c.statuses);
    return getMatrixCellStatus(records, allStatuses);
  };

  const handleMatrixCellClick = (aircraftType: string, ataChapter: string) => {
    const records = matrixData.matrix[aircraftType]?.[ataChapter] || [];
    setMatrixDetailData({ aircraftType, ataChapter, records });
    setIsMatrixDetailOpen(true);
  };

  const closeMatrixDetail = () => {
    setIsMatrixDetailOpen(false);
    setMatrixDetailData(null);
  };

  const handleFormChange = (field: keyof FormValues, value: string) => {
    setFormValues(prev => ({ ...prev, [field]: value }));
  };

  const findRecordWorkflowConfig = (record: ReviewRecord): WorkflowConfig | undefined => {
    return findWorkflowConfig(workflowConfigs, record.aircraftType, record.ataChapter, record.checkArea);
  };

  const handleAddRecord = async () => {
    const config = currentWorkflowConfig;
    const formData = formValues as unknown as Record<string, string>;
    const baseValidation = validateRequiredFields(getVisibleFields(config), formData);
    if (!baseValidation.valid) {
      alert(`请填写必填字段：${baseValidation.missingFields.join("、")}`);
      return;
    }

    const initialStatus = getInitialStatus(config);
    if (config && formValues.status !== initialStatus) {
      const transition = getAvailableStatusTransitions(config, initialStatus, activeRole)
        .find(item => item.to === formValues.status);
      if (!transition) {
        alert(`${activeRole}不能将新记录直接流转为${formValues.status}`);
        return;
      }
      const transitionRequiredFields = (transition.requiredFields ?? [])
        .map(fieldKey => config.fields.find(field => field.key === fieldKey))
        .filter((field): field is FieldConfig => Boolean(field));
      const transitionValidation = validateRequiredFields(
        transitionRequiredFields.map(field => ({ ...field, required: true })),
        formData
      );
      if (!transitionValidation.valid) {
        alert(`状态流转到${formValues.status}前请填写：${transitionValidation.missingFields.join("、")}`);
        return;
      }
    }

    const newRecord: ReviewRecord = {
      id: `review-${Date.now()}`,
      aircraftType: formValues.aircraftType,
      ataChapter: formValues.ataChapter,
      checkArea: formValues.checkArea,
      checkItem: formValues.checkItem,
      status: formValues.status,
      defectDesc: formValues.defectDesc,
      handling: formValues.handling
    };

    try {
      await addRecord(newRecord);
      setReviewRecords(prev => [...prev, newRecord]);
      await recordStatusChange(newRecord.id, "新建", formValues.status, `${activeRole}提交检查记录`);
      setFormValues({ ...emptyForm, status: getInitialStatus(config) });
    } catch (error) {
      console.error("Failed to add record:", error);
    }
  };

  const handleTemplateFormChange = (field: keyof TemplateFormValues, value: string) => {
    setTemplateForm(prev => ({ ...prev, [field]: value }));
  };

  const openNewModal = () => {
    setEditingTemplate(null);
    setIsTemplateFromRecord(false);
    setTemplateForm({
      name: "",
      aircraftType: "",
      ataChapter: "",
      checkArea: "",
      checkItem: "",
      defectDesc: "",
      handling: "",
      signer: ""
    });
    setIsModalOpen(true);
  };

  const openEditModal = (template: CheckTemplate) => {
    setEditingTemplate(template);
    setIsTemplateFromRecord(false);
    setTemplateForm({
      name: template.name,
      aircraftType: template.aircraftType,
      ataChapter: template.ataChapter,
      checkArea: template.checkArea,
      checkItem: template.checkItem,
      defectDesc: template.defectDesc,
      handling: template.handling,
      signer: template.signer
    });
    setIsModalOpen(true);
  };

  const openSaveAsTemplateModal = (record: ReviewRecord) => {
    setEditingTemplate(null);
    setIsTemplateFromRecord(true);
    const defaultName = `${record.aircraftType} ${record.checkArea}检查模板`;
    setTemplateForm({
      name: defaultName,
      aircraftType: record.aircraftType,
      ataChapter: record.ataChapter,
      checkArea: record.checkArea,
      checkItem: record.checkItem || "",
      defectDesc: record.defectDesc,
      handling: record.handling,
      signer: ""
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingTemplate(null);
    setIsTemplateFromRecord(false);
  };

  const isTemplateNameDuplicate = (name: string): boolean => {
    const trimmedName = name.trim();
    if (trimmedName === "") return false;
    return templates.some(t => 
      t.name.trim() === trimmedName && t.id !== editingTemplate?.id
    );
  };

  const saveTemplate = async () => {
    if (templateForm.name.trim() === "") return;

    if (isTemplateNameDuplicate(templateForm.name)) {
      const confirmed = window.confirm(
        `模板名称"${templateForm.name.trim()}"已存在，是否继续保存？`
      );
      if (!confirmed) return;
    }

    if (editingTemplate) {
      const updated = { ...editingTemplate, ...templateForm };
      try {
        await updateTemplate(updated);
        setTemplates(prev =>
          prev.map(t => t.id === editingTemplate.id ? updated : t)
        );
      } catch (error) {
        console.error("Failed to update template:", error);
      }
    } else {
      const newTemplate: CheckTemplate = {
        id: String(Date.now()),
        ...templateForm
      };
      try {
        await addTemplate(newTemplate);
        setTemplates(prev => [...prev, newTemplate]);
      } catch (error) {
        console.error("Failed to add template:", error);
      }
    }
    closeModal();
  };

  const deleteTemplate = async (id: string) => {
    try {
      await dbDeleteTemplate(id);
      setTemplates(prev => prev.filter(t => t.id !== id));
    } catch (error) {
      console.error("Failed to delete template:", error);
    }
  };

  const applyTemplate = (template: CheckTemplate) => {
    setFormValues({
      aircraftType: template.aircraftType,
      ataChapter: template.ataChapter,
      checkArea: template.checkArea,
      checkItem: template.checkItem,
      defectDesc: template.defectDesc,
      handling: template.handling,
      signer: template.signer,
      status: "待复核"
    });
  };

  const generateExportSummary = useMemo(() => {
    const lines: string[] = [];
    lines.push("航空维修检查记录摘要");
    lines.push("=".repeat(50));
    lines.push(`生成时间: ${new Date().toLocaleString("zh-CN")}`);
    lines.push("");

    reviewRecords.forEach((record, index) => {
      lines.push(`【记录 ${String(index + 1).padStart(2, "0")}】`);
      lines.push(`  机型: ${record.aircraftType}`);
      lines.push(`  ATA章节: ${record.ataChapter}`);
      lines.push(`  检查区域: ${record.checkArea}`);
      lines.push(`  缺陷描述: ${record.defectDesc || "无"}`);
      lines.push(`  处理意见: ${record.handling || "待处理"}`);
      lines.push(`  状态: ${record.status}`);
      lines.push("");
    });

    lines.push("-".repeat(50));
    lines.push(`统计信息: 共 ${reviewStats.total} 条记录`);
    lines.push(`  正常: ${reviewStats.normal} 条`);
    lines.push(`  待复核: ${reviewStats.pending} 条`);
    lines.push(`  缺陷项: ${reviewStats.defect} 条`);
    lines.push("=".repeat(50));

    return lines.join("\n");
  }, [reviewRecords, reviewStats]);

  const openExportPreview = () => {
    setCopyStatus("idle");
    setIsExportPreviewOpen(true);
  };

  const closeExportPreview = () => {
    setIsExportPreviewOpen(false);
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(generateExportSummary);
      setCopyStatus("success");
    } catch (err) {
      const textarea = document.createElement("textarea");
      textarea.value = generateExportSummary;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand("copy");
        setCopyStatus("success");
      } catch (fallbackErr) {
        setCopyStatus("failed");
      }
      document.body.removeChild(textarea);
    }
    setTimeout(() => setCopyStatus("idle"), 2000);
  };

  if (isLoading) {
    return (
      <main className="app-shell">
        <div className="empty-state" style={{ marginTop: 48 }}>
          <p>正在加载数据...</p>
        </div>
      </main>
    );
  }

  const pendingCount = getPendingSyncCount();
  const lastSync = getLastSyncTime();

  const handleManualSync = async () => {
    if (networkStatus === "offline") {
      alert("当前处于离线状态，请恢复网络后再尝试同步。");
      return;
    }
    await attemptAutoSync();
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

  return (
    <main className="app-shell">
      {networkStatus === "offline" && (
        <div className="offline-banner offline-banner-active">
          <div className="offline-banner-content">
            <span className="offline-icon">📡</span>
            <div className="offline-banner-text">
              <strong>当前处于离线模式</strong>
              <span>检查记录将暂存本地，网络恢复后自动同步。{cacheReady ? "核心资源已缓存，可正常使用。" : ""}</span>
            </div>
            <span className="offline-badge">离线</span>
          </div>
        </div>
      )}

      {showOnlineRestoredToast && networkStatus === "online" && (
        <div className="online-restored-toast">
          <div className="toast-content">
            <span className="toast-icon">✅</span>
            <div>
              <strong>网络已恢复连接</strong>
              {pendingCount > 0 ? (
                <span>检测到 {pendingCount} 条待同步记录，正在自动同步...</span>
              ) : (
                <span>所有数据已保持最新</span>
              )}
            </div>
          </div>
        </div>
      )}

      {networkStatus === "online" && (
        <div className="sync-status-bar">
          <div className="sync-status-row">
            <div className="sync-status-left">
              <span className={`sync-status-dot sync-status-dot-${networkStatus}`}></span>
              <span className="sync-status-text">
                网络状态：<strong className={networkStatus === "online" ? "text-online" : "text-offline"}>在线</strong>
              </span>
              {swStatus && (
                <>
                  <span className="sync-status-divider">·</span>
                  <span className={`sw-status-badge sw-status-${swStatus.registrationStatus}`}>
                    <span className="sw-status-dot"></span>
                    离线缓存：{getSWStatusText(swStatus.registrationStatus)}
                  </span>
                </>
              )}
              {swStatus?.isCached && (
                <>
                  <span className="sync-status-divider">·</span>
                  <span className="sync-cache-status">
                    <span className="cache-check-icon">✓</span>
                    {swStatus.cacheInfo?.totalAssets || 0} 个资源已缓存
                  </span>
                </>
              )}
              {lastSync && (
                <>
                  <span className="sync-status-divider">·</span>
                  <span className="sync-last-time">上次同步：{formatLastSync(lastSync)}</span>
                </>
              )}
            </div>
            <div className="sync-status-right">
              {swStatus && (
                <button
                  className="cache-manage-btn"
                  onClick={() => setShowCachePanel(!showCachePanel)}
                  title="缓存管理"
                >
                  <span>🛠️</span>
                  <span>缓存管理</span>
                </button>
              )}
              {swStatus?.waitingWorker && (
                <button className="primary-action sw-update-btn" onClick={handleActivateWaiting}>
                  🚀 立即更新
                </button>
              )}
              {pendingCount > 0 && (
                <button
                  className={`sync-pending-button ${syncStatus === "syncing" ? "syncing" : ""}`}
                  onClick={() => setShowSyncPanel(!showSyncPanel)}
                >
                  {syncStatus === "syncing" ? (
                    <>
                      <span className="sync-spinner"></span>
                      <span>同步中...</span>
                    </>
                  ) : syncStatus === "synced" ? (
                    <>
                      <span className="sync-check">✓</span>
                      <span>同步完成</span>
                    </>
                  ) : syncStatus === "error" ? (
                    <>
                      <span className="sync-error">⚠</span>
                      <span>同步异常</span>
                    </>
                  ) : (
                    <>
                      <span className="sync-pending-count">{pendingCount}</span>
                      <span>条待同步</span>
                    </>
                  )}
                </button>
              )}
              {pendingCount > 0 && networkStatus === "online" && (
                <button className="primary-action sync-now-btn" onClick={handleManualSync}>
                  {syncStatus === "syncing" ? "同步中..." : "立即同步"}
                </button>
              )}
            </div>
          </div>

          {showCachePanel && swStatus && (
            <div className="sync-panel cache-panel">
              <div className="sync-panel-header">
                <h3>离线缓存管理</h3>
                <span className="sync-panel-count">
                  已缓存 {swStatus.cacheInfo?.totalAssets || 0} 个资源
                </span>
              </div>
              <div className="cache-panel-content">
                <div className="cache-info-grid">
                  <div className="cache-info-item">
                    <div className="cache-info-label">Service Worker 状态</div>
                    <div className="cache-info-value">
                      <span className={`sw-status-badge sw-status-${swStatus.registrationStatus}`}>
                        {getSWStatusText(swStatus.registrationStatus)}
                      </span>
                    </div>
                  </div>
                  <div className="cache-info-item">
                    <div className="cache-info-label">缓存版本</div>
                    <div className="cache-info-value">{swStatus.cacheInfo?.version || "—"}</div>
                  </div>
                  <div className="cache-info-item">
                    <div className="cache-info-label">缓存存储空间</div>
                    <div className="cache-info-value">
                      {swStatus.cacheInfo?.totalAssets || 0} 个文件
                    </div>
                  </div>
                  <div className="cache-info-item">
                    <div className="cache-info-label">缓存名称</div>
                    <div className="cache-info-value">
                      {swStatus.cacheInfo?.cacheNames.join(", ") || "—"}
                    </div>
                  </div>
                </div>
                <div className="cache-panel-actions">
                  <button className="secondary-action cache-action-btn" onClick={handlePrecache}>
                    <span>📥</span>
                    <span>预缓存资源</span>
                  </button>
                  <button className="secondary-action cache-action-btn" onClick={handleUpdateSW}>
                    <span>🔄</span>
                    <span>检查更新</span>
                  </button>
                  <button className="secondary-action cache-action-btn" onClick={handleRefreshCacheInfo}>
                    <span>🔁</span>
                    <span>刷新状态</span>
                  </button>
                  <button className="danger-action cache-action-btn" onClick={handleClearCache}>
                    <span>🗑️</span>
                    <span>清除缓存</span>
                  </button>
                </div>
                <div className="cache-panel-desc">
                  <p>💡 <strong>离线模式说明：</strong></p>
                  <ul>
                    <li>首次访问后，核心静态资源会自动缓存，断网时仍可访问</li>
                    <li>离线时录入的检查记录会暂存本地，网络恢复后自动同步</li>
                    <li>清除缓存后需要重新联网才能再次缓存资源</li>
                  </ul>
                </div>
              </div>
              <div className="sync-panel-footer">
                <button
                  className="sync-panel-close"
                  onClick={() => setShowCachePanel(false)}
                >
                  关闭
                </button>
              </div>
            </div>
          )}

          {showSyncPanel && pendingCount > 0 && (
            <div className="sync-panel">
              <div className="sync-panel-header">
                <h3>待同步操作队列</h3>
                <span className="sync-panel-count">共 {pendingCount} 条</span>
              </div>
              <div className="sync-panel-list">
                {syncQueue.filter(op => !op.synced).map(op => (
                  <div key={op.id} className="sync-panel-item">
                    <div className="sync-item-icon">
                      {op.type.includes("add") || op.type.includes("create") ? "+" : op.type.includes("delete") ? "×" : "↻"}
                    </div>
                    <div className="sync-item-info">
                      <div className="sync-item-type">{getOperationLabel(op.type)}</div>
                      <div className="sync-item-time">
                        入队时间：{new Date(op.createdAt).toLocaleString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </div>
                    </div>
                    <div className="sync-item-status">
                      {op.error ? (
                        <span className="sync-item-error" title={op.error}>⚠ 失败</span>
                      ) : (
                        <span className="sync-item-waiting">等待中</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="sync-panel-footer">
                <button
                  className="sync-panel-close"
                  onClick={() => {
                    clearSyncedOperations();
                    setShowSyncPanel(false);
                  }}
                >
                  关闭
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <section className="hero">
        <div>
          <p className="eyebrow">{project.id} · port {project.port}</p>
          <h1>{project.title}</h1>
          <p className="subtitle">{project.subtitle}</p>
        </div>
        <div className="stack-card">
          <span>技术栈</span>
          <strong>{project.stack}</strong>
        </div>
        </section>

      <section className="metrics-grid">
        {metricValues.map((metric, index) => (
          <MetricCard key={metric.key} label={metric.label} value={metric.value} index={metric.colorIndex} />
        ))}
      </section>

      <section className="matrix-panel">
        <div className="section-heading">
          <div>
            <p>ATA进度追踪</p>
            <h2>章节进度矩阵</h2>
          </div>
          <div className="matrix-legend">
            <div className="legend-item">
              <span className="legend-dot legend-normal"></span>
              <span>正常</span>
            </div>
            <div className="legend-item">
              <span className="legend-dot legend-pending"></span>
              <span>待复核</span>
            </div>
            <div className="legend-item">
              <span className="legend-dot legend-defect"></span>
              <span>缺陷</span>
            </div>
            <div className="legend-item">
              <span className="legend-dot legend-not-started"></span>
              <span>未开始</span>
            </div>
          </div>
        </div>
        <div className="matrix-container">
          <table className="ata-matrix">
            <thead>
              <tr>
                <th className="matrix-corner">机型 \ ATA章节</th>
                {matrixData.ataChapters.map(chapter => (
                  <th key={chapter} className="matrix-header">{chapter}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrixData.aircraftTypes.map(aircraft => (
                <tr key={aircraft}>
                  <td className="matrix-row-header">{aircraft}</td>
                  {matrixData.ataChapters.map(chapter => {
                    const records = matrixData.matrix[aircraft]?.[chapter] || [];
                    const status = getCellStatus(records);
                    return (
                      <td
                        key={`${aircraft}-${chapter}`}
                        className={`matrix-cell matrix-cell-${status}`}
                        onClick={() => handleMatrixCellClick(aircraft, chapter)}
                      >
                        <span className="cell-count">{records.length}</span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="workspace">
        <aside className="panel narrow">
          <h2>角色</h2>
          <div className="chips role-chips">
            {project.users.map((user: UserRole) => (
              <button
                key={user}
                className={activeRole === user ? "chip-active" : ""}
                onClick={() => setActiveRole(user)}
              >
                <span className="role-name">{user}</span>
                {activeRole === user && (
                  <span className="role-desc">{getRoleDescription(user)}</span>
                )}
              </button>
            ))}
          </div>
          <h2>筛选</h2>
          <div className="chips muted">
            <button
              className={activeFilter === null ? "chip-active" : ""}
              onClick={() => setActiveFilter(null)}
            >
              全部
            </button>
            {activeFilters.map(filter => (
              <button
                key={filter.key}
                className={activeFilter === filter.key ? "chip-active" : ""}
                onClick={() => setActiveFilter(filter.key)}
              >
                {filter.label}
              </button>
            ))}
          </div>
          <div className="advanced-filters">
            <h3 className="advanced-filters-title">组合筛选</h3>
            <label className="advanced-filter-item">
              <span>机型</span>
              <select
                value={recordFilters.aircraftType}
                onChange={e => handleRecordFilterChange("aircraftType", e.target.value)}
              >
                <option value="">全部机型</option>
                {availableAircraftTypeOptions.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className="advanced-filter-item">
              <span>ATA章节</span>
              <select
                value={recordFilters.ataChapter}
                onChange={e => handleRecordFilterChange("ataChapter", e.target.value)}
                disabled={!recordFilters.ataChapter && availableAtaChapterOptions.length === 0}
              >
                <option value="">全部章节</option>
                {availableAtaChapterOptions.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="advanced-filter-item">
              <span>状态</span>
              <select
                value={recordFilters.status}
                onChange={e => handleRecordFilterChange("status", e.target.value)}
              >
                <option value="">全部状态</option>
                {availableStatusOptions.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="advanced-filter-item">
              <span>放行复核</span>
              <select
                value={recordFilters.hasReleaseReview}
                onChange={e => handleRecordFilterChange("hasReleaseReview", e.target.value)}
              >
                <option value="">全部</option>
                <option value="yes">已有复核</option>
                <option value="no">待复核</option>
              </select>
            </label>
            <button
              className="reset-filters-btn"
              onClick={resetRecordFilters}
              disabled={activeFilter === null && recordFilters.aircraftType === "" && recordFilters.ataChapter === "" && recordFilters.status === "" && recordFilters.hasReleaseReview === ""}
            >
              重置筛选
            </button>
          </div>
        </aside>

        <section className="panel">
          <div className="section-heading">
            <div>
              <p>{project.domain}</p>
              <h2>记录字段</h2>
              {currentWorkflowConfig && (
                <p className="workflow-info">当前流程：{currentWorkflowConfig.displayName}</p>
              )}
              <p className="workflow-info">
                当前角色：<strong>{activeRole}</strong>
                {!canRolePerformAction(currentWorkflowConfig, activeRole, "edit")
                  ? "（只读模式，无法编辑字段"
                  : `（可编辑字段：${getRoleEditableFields(currentWorkflowConfig, activeRole).join("、") || "无"}`
              }
              </p>
            </div>
            {canRolePerformAction(currentWorkflowConfig, activeRole, "create") && (
              <button className="primary-action" onClick={handleAddRecord}>新增记录</button>
            )}
          </div>
          <div className="field-grid">
            {getVisibleFields(currentWorkflowConfig).map(field => {
              const isEditable = !currentWorkflowConfig || canRoleEditField(currentWorkflowConfig, field.key, activeRole);
              let options = field.options;
              if (field.key === "aircraftType") {
                options = availableAircraftTypes;
              } else if (field.key === "ataChapter") {
                options = availableAtaChapters;
              } else if (field.key === "checkArea") {
                options = availableCheckAreas;
              } else if (field.key === "status" && currentWorkflowConfig) {
                options = allowedStatusOptions;
              }
              const fieldWithOptions = { ...field, options };
              return (
                <DynamicFormField
                  key={field.key}
                  field={fieldWithOptions}
                  value={getFormFieldValue(field.key)}
                  onChange={handleFormFieldChange}
                  disabled={!isEditable}
                />
              );
            })}
          </div>
        </section>
      </section>

      {activeRole !== "培训教员" && (
        <section className="records panel">
          <div className="section-heading">
            <div>
              <p>模板管理</p>
              <h2>检查任务模板</h2>
            </div>
            <button className="primary-action" onClick={openNewModal}>
              新增模板
            </button>
          </div>
          <div className="template-list">
            {templates.length === 0 ? (
              <div className="empty-state">
                <p>暂无模板，点击"新增模板"创建常用检查项目模板</p>
              </div>
            ) : (
              templates.map(template => (
                <article key={template.id} className="template-card">
                  <div className="template-header">
                    <div>
                      <h3>{template.name}</h3>
                      <p className="template-meta">
                        {template.aircraftType} · {template.ataChapter} · {template.checkArea}
                      </p>
                    </div>
                    <div className="template-actions">
                      {activeRole === "维修工程师" && (
                        <button className="apply-btn" onClick={() => applyTemplate(template)}>
                          应用模板
                        </button>
                      )}
                      <button onClick={() => openEditModal(template)}>编辑</button>
                      <button className="delete-btn" onClick={() => deleteTemplate(template.id)}>
                        删除
                      </button>
                    </div>
                  </div>
                  {template.checkItem && (
                    <div className="template-content">
                      <span className="template-label">检查项目：</span>
                      <span>{template.checkItem}</span>
                    </div>
                  )}
                </article>
              ))
            )}
          </div>
        </section>
      )}

      {activeRole === "放行人员" ? (
        <section className="release-panel">
          <div className="section-heading">
            <div>
              <p>放行前复核</p>
              <h2>放行复核工作台</h2>
            </div>
            <div className="review-actions">
              <button className="review-summary-btn">
                复核进度 {releaseStats.reviewed}/{releaseStats.total}
                {releaseStats.defectReviewed > 0 && (
                  <span className="defect-review-count"> · 缺陷 {releaseStats.defectReviewed}</span>
                )}
              </button>
            </div>
          </div>

          <div className="release-metrics">
            <div className="release-metric">
              <span>记录总数</span>
              <strong>{releaseStats.total}</strong>
            </div>
            <div className="release-metric release-metric-ok">
              <span>正常</span>
              <strong>{releaseStats.normal}</strong>
            </div>
            <div className="release-metric release-metric-watch">
              <span>待复核</span>
              <strong>{releaseStats.pending}</strong>
            </div>
            <div className="release-metric release-metric-danger">
              <span>缺陷项</span>
              <strong>{releaseStats.defect}</strong>
            </div>
            <div className="release-metric release-metric-primary">
              <span>已通过</span>
              <strong>{releaseStats.passed}</strong>
            </div>
            <div className="release-metric release-metric-rejected">
              <span>已驳回</span>
              <strong>{releaseStats.rejected}</strong>
            </div>
          </div>

          <div className="release-groups">
            <div className="release-group">
              <div className="release-group-header release-group-ok">
                <h3>正常</h3>
                <span className="group-count">{groupedRecords.normal.length}</span>
              </div>
              <div className="release-group-list">
                {groupedRecords.normal.length === 0 ? (
                  <div className="empty-state small">
                    <p>暂无正常记录</p>
                  </div>
                ) : (
                  groupedRecords.normal.map((record, index) => (
                    <ReleaseReviewCard
                      key={record.id}
                      record={record}
                      index={index}
                      review={releaseReviews[record.id]}
                      opinion={releaseOpinions[record.id] || ""}
                      onOpinionChange={handleReleaseOpinionChange}
                      onReview={handleReleaseReview}
                      recordType="normal"
                      history={statusHistory[record.id]}
                      showHistory={activeHistoryRecordId === record.id}
                      onToggleHistory={(id) => setActiveHistoryRecordId(
                        activeHistoryRecordId === id ? null : id
                      )}
                    />
                  ))
                )}
              </div>
            </div>

            <div className="release-group">
              <div className="release-group-header release-group-watch">
                <h3>待复核</h3>
                <span className="group-count">{groupedRecords.pending.length}</span>
              </div>
              <div className="release-group-list">
                {groupedRecords.pending.length === 0 ? (
                  <div className="empty-state small">
                    <p>暂无待复核记录</p>
                  </div>
                ) : (
                  groupedRecords.pending.map((record, index) => (
                    <ReleaseReviewCard
                      key={record.id}
                      record={record}
                      index={index}
                      review={releaseReviews[record.id]}
                      opinion={releaseOpinions[record.id] || ""}
                      onOpinionChange={handleReleaseOpinionChange}
                      onReview={handleReleaseReview}
                      recordType="pending"
                      history={statusHistory[record.id]}
                      showHistory={activeHistoryRecordId === record.id}
                      onToggleHistory={(id) => setActiveHistoryRecordId(
                        activeHistoryRecordId === id ? null : id
                      )}
                    />
                  ))
                )}
              </div>
            </div>

            <div className="release-group">
              <div className="release-group-header release-group-danger">
                <h3>缺陷</h3>
                <span className="group-count">{groupedRecords.defect.length}</span>
              </div>
              <div className="release-group-list">
                {groupedRecords.defect.length === 0 ? (
                  <div className="empty-state small">
                    <p>暂无缺陷记录</p>
                  </div>
                ) : (
                  groupedRecords.defect.map((record, index) => (
                    <ReleaseReviewCard
                      key={record.id}
                      record={record}
                      index={index}
                      review={releaseReviews[record.id]}
                      opinion={releaseOpinions[record.id] || ""}
                      onOpinionChange={handleReleaseOpinionChange}
                      onReview={handleReleaseReview}
                      recordType="defect"
                      history={statusHistory[record.id]}
                      showHistory={activeHistoryRecordId === record.id}
                      onToggleHistory={(id) => setActiveHistoryRecordId(
                        activeHistoryRecordId === id ? null : id
                      )}
                    />
                  ))
                )}
              </div>
            </div>
          </div>
        </section>
      ) : activeRole === "培训教员" ? (
        <section className="review-panel">
          <div className="section-heading">
            <div>
              <p>培训讲评</p>
              <h2>检查讲评视图</h2>
              <p className="workflow-info">{getRoleDescription(activeRole)}</p>
            </div>
            <div className="review-actions">
              <button className="review-summary-btn">
                讲评进度 {filteredRecords.filter(r => trainingComments[r.id]?.comment?.trim()).length}/{reviewStats.total}
              </button>
            </div>
          </div>

          <div className="review-metrics">
            <div className="review-metric">
              <span>记录总数</span>
              <strong>{reviewStats.total}</strong>
            </div>
            <div className="review-metric review-metric-ok">
              <span>正常</span>
              <strong>{reviewStats.normal}</strong>
            </div>
            <div className="review-metric review-metric-watch">
              <span>待复核</span>
              <strong>{reviewStats.pending}</strong>
            </div>
            <div className="review-metric review-metric-danger">
              <span>缺陷项</span>
              <strong>{reviewStats.defect}</strong>
            </div>
            <div className="review-metric review-metric-primary">
              <span>已讲评</span>
              <strong>{filteredRecords.filter(r => trainingComments[r.id]?.comment?.trim()).length}</strong>
            </div>
            <div className="review-metric review-metric-watch">
              <span>待讲评</span>
              <strong>{filteredRecords.length - filteredRecords.filter(r => trainingComments[r.id]?.comment?.trim()).length}</strong>
            </div>
          </div>

          <div className="review-list">
            {filteredRecords.length === 0 ? (
              <div className="empty-state">
                <p>暂无符合筛选条件的记录</p>
              </div>
            ) : (
              filteredRecords.map((record, index) => {
                const recordHistory = statusHistory[record.id] || [];
                const commentData = trainingComments[record.id];
                const releaseReview = releaseReviews[record.id];
                return (
                  <article key={record.id} className="review-card">
                    <div className="review-card-header">
                      <div className="review-card-index">{String(index + 1).padStart(2, "0")}</div>
                      <div className="review-card-title">
                        <div className="review-card-top">
                          <h3>{record.aircraftType}</h3>
                          <span className={`status-badge ${getStatusBadgeClass(record.status)}`}>
                            {record.status}
                          </span>
                          <button
                            className="history-btn"
                            onClick={() => setActiveHistoryRecordId(
                              activeHistoryRecordId === record.id ? null : record.id
                            )}
                          >
                            📋 状态历史 ({recordHistory.length})
                          </button>
                        </div>
                        <div className="review-card-meta">
                          <span className="meta-tag">{record.ataChapter}</span>
                          <span className="meta-tag meta-tag-muted">{record.checkArea}</span>
                          {record.checkItem && <span className="meta-tag meta-tag-muted">{record.checkItem}</span>}
                        </div>
                      </div>
                    </div>

                    {activeHistoryRecordId === record.id && recordHistory.length > 0 && (
                      <div className="history-timeline">
                        <div className="section-label">状态变更历史</div>
                        {recordHistory.map((item, hIdx) => (
                          <div key={item.id} className="history-timeline-item">
                            <div className="history-dot"></div>
                            <div className="history-content">
                              <div className="history-header">
                                <span className="history-status-from">{item.fromStatus}</span>
                                <span className="history-arrow">→</span>
                                <span className="history-status-to">{item.toStatus}</span>
                                <span className="history-operator">
                                  {item.operatorRole}
                                </span>
                                <span className="history-time">
                                  {new Date(item.changedAt).toLocaleString("zh-CN", {
                                    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"
                                  })}
                                </span>
                              </div>
                              {item.remark && (
                                <div className="history-remark">{item.remark}</div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="review-card-body">
                      {record.handling && (
                        <div className="handling-section">
                          <div className="section-label">处理意见</div>
                          <div className="handling-content">{record.handling}</div>
                        </div>
                      )}
                      <div className="defect-section">
                        <div className="section-label">缺陷说明</div>
                        <div className="defect-content">
                          {record.defectDesc ? record.defectDesc : "无缺陷描述"}
                        </div>
                      </div>

                      {releaseReview && (
                        <div className="release-review-section">
                          <div className="section-label">
                            放行复核
                            <span className="reviewer-info">
                              {releaseReview.reviewer} · {new Date(releaseReview.reviewedAt).toLocaleString("zh-CN", {
                                month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"
                              })}
                            </span>
                          </div>
                          <div className={`review-result-display ${releaseReview.status}`}>
                            <strong>{releaseReview.status === "passed" ? "✅ 通过" : "❌ 驳回"}</strong>
                            {releaseReview.opinion && <p>{releaseReview.opinion}</p>}
                          </div>
                        </div>
                      )}

                      <div className="comment-section">
                        <div className="section-label">
                          培训讲评备注
                          {commentData?.comment?.trim().length > 0 && (
                            <span className="comment-indicator">已填写</span>
                          )}
                          {commentData?.updatedAt && (
                            <span className="reviewer-info">
                              最后更新：{new Date(commentData.updatedAt).toLocaleString("zh-CN", {
                                month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"
                              })}
                            </span>
                          )}
                        </div>
                        <textarea
                          className="comment-textarea"
                          placeholder="请输入培训讲评意见，例如：针对该缺陷的处置要点、常见问题、注意事项、改进建议..."
                          rows={4}
                          value={commentData?.comment || ""}
                          onChange={e => handleTrainingCommentChange(record.id, e.target.value)}
                        />
                      </div>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>
      ) : (
        <>
          <section className="defect-panel">
            <div className="section-heading">
              <div>
                <p>维修缺陷闭环</p>
                <h2>缺陷处理工作台</h2>
              </div>
              <div className="defect-tabs">
                <button
                  className={activeDefectTab === "pending" ? "defect-tab-active" : ""}
                  onClick={() => setActiveDefectTab("pending")}
                >
                  待处理 ({groupedDefects.pending.length})
                </button>
                <button
                  className={activeDefectTab === "history" ? "defect-tab-active" : ""}
                  onClick={() => setActiveDefectTab("history")}
                >
                  历史记录 ({groupedDefects.history.length})
                </button>
              </div>
            </div>

            <div className="defect-metrics">
              <div className="defect-metric">
                <span>缺陷总数</span>
                <strong>{defectStats.total}</strong>
              </div>
              <div className="defect-metric defect-metric-pending">
                <span>待处理</span>
                <strong>{defectStats.pending}</strong>
              </div>
              <div className="defect-metric defect-metric-processing">
                <span>处理中</span>
                <strong>{defectStats.processing}</strong>
              </div>
              <div className="defect-metric defect-metric-completed">
                <span>已完成</span>
                <strong>{defectStats.completed}</strong>
              </div>
              <div className="defect-metric defect-metric-rejected">
                <span>已退回</span>
                <strong>{defectStats.rejected}</strong>
              </div>
            </div>

            {activeDefectTab === "pending" ? (
              <div className="defect-list">
                {groupedDefects.pending.length === 0 ? (
                  <div className="empty-state">
                    <p>暂无待处理缺陷。请在下方"近期记录"中点击缺陷项的"生成缺陷"按钮，将缺陷加入待处理清单。</p>
                  </div>
                ) : (
                  groupedDefects.pending.map((defect, index) => (
                    <DefectCard
                      key={defect.id}
                      defect={defect}
                      index={index}
                      formValues={defectFormValues[defect.id] || { handlingOpinion: "", assignedSigner: "", rejectedReason: "", completedNote: "" }}
                      sourceRecord={getDefectSourceRecord(defect.sourceRecordId)}
                      onFormChange={handleDefectFormChange}
                      onStartProcessing={handleStartProcessing}
                      onComplete={handleCompleteDefect}
                      onReject={handleRejectDefect}
                      onReopen={handleReopenDefect}
                      onDelete={handleDeleteDefect}
                      isHistory={false}
                    />
                  ))
                )}
              </div>
            ) : (
              <div className="defect-list">
                {groupedDefects.history.length === 0 ? (
                  <div className="empty-state">
                    <p>暂无历史缺陷记录。</p>
                  </div>
                ) : (
                  groupedDefects.history.map((defect, index) => (
                    <DefectCard
                      key={defect.id}
                      defect={defect}
                      index={index}
                      formValues={defectFormValues[defect.id] || { handlingOpinion: "", assignedSigner: "", rejectedReason: "", completedNote: "" }}
                      sourceRecord={getDefectSourceRecord(defect.sourceRecordId)}
                      onFormChange={handleDefectFormChange}
                      onStartProcessing={handleStartProcessing}
                      onComplete={handleCompleteDefect}
                      onReject={handleRejectDefect}
                      onReopen={handleReopenDefect}
                      onDelete={handleDeleteDefect}
                      isHistory={true}
                    />
                  ))
                )}
              </div>
            )}
          </section>

          <section className="records panel">
            <div className="section-heading">
              <div>
                <p>检查记录</p>
                <h2>近期记录</h2>
              </div>
              <button onClick={openExportPreview}>导出摘要</button>
            </div>
            <div className="record-list">
              {filteredRecords.length === 0 ? (
                <div className="empty-state">
                  <p>暂无记录，点击"新增记录"创建第一条检查记录</p>
                </div>
              ) : (
                filteredRecords.map((record, index) => (
                  (() => {
                    const recordConfig = findRecordWorkflowConfig(record);
                    const displayFields = getRecordDisplayFields(recordConfig, record)
                      .filter(field => field.label !== "机型");
                    const hasDefect = canCreateDefect(recordConfig, activeRole, record.status);
                    const defectExists = !!Object.values(defects).find(d => d.sourceRecordId === record.id);
                    const recordHistory = statusHistory[record.id] || [];
                    const isExpanded = activeHistoryRecordId === record.id;
                    const releaseReview = releaseReviews[record.id];
                    return (
                      <article key={record.id} className="record-card">
                        <div className={`record-index ${hasDefect ? "record-index-defect" : ""}`}>
                          {String(index + 1).padStart(2, "0")}
                        </div>
                        <div className="record-content">
                          <div className="record-header-row">
                            <h3>{record.aircraftType}</h3>
                            <span className={`status-badge ${getStatusBadgeClass(record.status)}`}>
                              {record.status}
                            </span>
                            <button
                              className="history-btn history-btn-sm"
                              onClick={() => setActiveHistoryRecordId(
                                activeHistoryRecordId === record.id ? null : record.id
                              )}
                            >
                              📋 ({recordHistory.length})
                            </button>
                          </div>
                          <p>
                            {displayFields.map(field => `${field.label}：${field.value}`).join(" · ")}
                          </p>
                        </div>
                        <div className="record-actions">
                          {activeRole !== "培训教员" && (
                            <button
                              className="save-as-template-btn"
                              onClick={() => openSaveAsTemplateModal(record)}
                            >
                              保存为模板
                            </button>
                          )}
                          {hasDefect && (
                            <button
                              className="generate-defect-btn"
                              onClick={() => handleGenerateDefectFromRecord(record)}
                              disabled={defectExists}
                            >
                              {defectExists ? "已加入清单" : "生成缺陷"}
                            </button>
                          )}
                        </div>
                        {isExpanded && (
                          <div className="record-expanded">
                            {recordHistory.length > 0 && (
                              <div className="history-timeline">
                                <div className="section-label">状态变更历史</div>
                                {recordHistory.map((item) => (
                                  <div key={item.id} className="history-timeline-item">
                                    <div className="history-dot"></div>
                                    <div className="history-content">
                                      <div className="history-header">
                                        <span className="history-status-from">{item.fromStatus}</span>
                                        <span className="history-arrow">→</span>
                                        <span className="history-status-to">{item.toStatus}</span>
                                        <span className="history-operator">{item.operatorRole}</span>
                                        <span className="history-time">
                                          {new Date(item.changedAt).toLocaleString("zh-CN", {
                                            month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"
                                          })}
                                        </span>
                                      </div>
                                      {item.remark && <div className="history-remark">{item.remark}</div>}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                            {releaseReview && (
                              <div className="release-review-section">
                                <div className="section-label">
                                  放行复核
                                  <span className="reviewer-info">
                                    {releaseReview.reviewer} · {new Date(releaseReview.reviewedAt).toLocaleString("zh-CN", {
                                      month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"
                                    })}
                                  </span>
                                </div>
                                <div className={`review-result-display ${releaseReview.status}`}>
                                  <strong>{releaseReview.status === "passed" ? "✅ 通过" : "❌ 驳回"}</strong>
                                  {releaseReview.opinion && <p>{releaseReview.opinion}</p>}
                                </div>
                              </div>
                            )}
                            {trainingComments[record.id]?.comment && (
                              <div className="comment-section">
                                <div className="section-label">
                                  培训讲评
                                  <span className="reviewer-info">
                                    {trainingComments[record.id].trainer} · {new Date(trainingComments[record.id].updatedAt).toLocaleString("zh-CN", {
                                      month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"
                                    })}
                                  </span>
                                </div>
                                <div className="comment-display">
                                  {trainingComments[record.id].comment}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </article>
                    );
                  })()
                ))
              )}
          </div>
        </section>
        </>
      )}

      {isModalOpen && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingTemplate ? "编辑模板" : isTemplateFromRecord ? "保存为模板" : "新增模板"}</h2>
              <button className="close-btn" onClick={closeModal}>×</button>
            </div>
            <div className="modal-body">
              <div className="field-grid">
                <label className="full-width">
                  <span>模板名称</span>
                  <input
                    placeholder="输入模板名称"
                    value={templateForm.name}
                    onChange={e => handleTemplateFormChange("name", e.target.value)}
                  />
                  {isTemplateNameDuplicate(templateForm.name) && (
                    <p className="duplicate-name-warning">
                      ⚠️ 该模板名称已存在，保存时会提示确认
                    </p>
                  )}
                </label>
                <label>
                  <span>机型</span>
                  <input
                    placeholder="填写机型"
                    value={templateForm.aircraftType}
                    onChange={e => handleTemplateFormChange("aircraftType", e.target.value)}
                  />
                </label>
                <label>
                  <span>ATA章节</span>
                  <input
                    placeholder="填写ATA章节"
                    value={templateForm.ataChapter}
                    onChange={e => handleTemplateFormChange("ataChapter", e.target.value)}
                  />
                </label>
                <label>
                  <span>检查区域</span>
                  <input
                    placeholder="填写检查区域"
                    value={templateForm.checkArea}
                    onChange={e => handleTemplateFormChange("checkArea", e.target.value)}
                  />
                </label>
                <label>
                  <span>检查项目</span>
                  <input
                    placeholder="填写检查项目"
                    value={templateForm.checkItem}
                    onChange={e => handleTemplateFormChange("checkItem", e.target.value)}
                  />
                </label>
                <label>
                  <span>缺陷描述</span>
                  <input
                    placeholder="填写缺陷描述"
                    value={templateForm.defectDesc}
                    onChange={e => handleTemplateFormChange("defectDesc", e.target.value)}
                  />
                </label>
                <label>
                  <span>处理意见</span>
                  <input
                    placeholder="填写处理意见"
                    value={templateForm.handling}
                    onChange={e => handleTemplateFormChange("handling", e.target.value)}
                  />
                </label>
                <label className="full-width">
                  <span>签署人</span>
                  <input
                    placeholder="填写签署人"
                    value={templateForm.signer}
                    onChange={e => handleTemplateFormChange("signer", e.target.value)}
                  />
                </label>
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={closeModal}>取消</button>
              <button className="primary-action" onClick={saveTemplate}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {isMatrixDetailOpen && matrixDetailData && (
        <div className="modal-overlay" onClick={closeMatrixDetail}>
          <div className="matrix-detail-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                {matrixDetailData.aircraftType} - {matrixDetailData.ataChapter}
                <span className="detail-count-badge">
                  共 {matrixDetailData.records.length} 条记录
                </span>
              </h2>
              <button className="close-btn" onClick={closeMatrixDetail}>×</button>
            </div>
            <div className="modal-body">
              {matrixDetailData.records.length === 0 ? (
                <div className="empty-state">
                  <p>该机型章节下暂无记录</p>
                </div>
              ) : (
                <div className="matrix-detail-list">
                  {matrixDetailData.records.map((record, index) => (
                    <article key={record.id} className="detail-card">
                      <div className="detail-card-header">
                        <div className="detail-card-index">{String(index + 1).padStart(2, "0")}</div>
                        <div className="detail-card-title">
                          <div className="detail-card-top">
                            <h3>{record.checkArea}</h3>
                            <span className={`status-badge ${getStatusBadgeClass(record.status)}`}>
                              {record.status}
                            </span>
                          </div>
                          {record.checkItem && (
                            <p className="detail-check-item">{record.checkItem}</p>
                          )}
                        </div>
                      </div>
                      <div className="detail-card-body">
                        <div className="detail-section">
                          <span className="detail-label">缺陷描述：</span>
                          <span>{record.defectDesc || "无"}</span>
                        </div>
                        {record.handling && (
                          <div className="detail-section">
                            <span className="detail-label">处理意见：</span>
                            <span>{record.handling}</span>
                          </div>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button onClick={closeMatrixDetail}>关闭</button>
            </div>
          </div>
        </div>
      )}

      {isExportPreviewOpen && (
        <div className="modal-overlay" onClick={closeExportPreview}>
          <div className="export-preview-content" onClick={e => e.stopPropagation()}>
            <div className="export-preview-header">
              <h2>导出摘要预览</h2>
              <button className="close-btn" onClick={closeExportPreview}>×</button>
            </div>
            <div className="export-preview-body">
              <pre className="export-summary-text">{generateExportSummary}</pre>
            </div>
            <div className="export-preview-footer">
              <button onClick={closeExportPreview}>关闭</button>
              <button
                className={`primary-action ${copyStatus === "failed" ? "copy-failed" : ""}`}
                onClick={copyToClipboard}
              >
                {copyStatus === "success" ? "已复制" : copyStatus === "failed" ? "复制失败，请手动选择" : "复制内容"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default App;
