import { useState, useMemo } from "react";
import {
  CheckTemplate,
  ReviewRecord,
  getAllTemplates,
  getAllRecords,
  addRecord,
  updateRecord,
  addTemplate,
  updateTemplate,
  deleteTemplate as dbDeleteTemplate
} from "../db";
import {
  WorkflowConfig,
  FieldConfig,
  findWorkflowConfig,
  getStatusCategory,
  validateRequiredFields,
  getInitialStatus,
  getAvailableStatusTransitions,
  getRoleVisibleFields,
  getMatrixCellStatus,
  StatusCategory
} from "../workflow";

export type UserRole = "维修工程师" | "放行人员" | "培训教员";

export interface FormValues {
  aircraftType: string;
  ataChapter: string;
  checkArea: string;
  checkItem: string;
  defectDesc: string;
  handling: string;
  signer: string;
  status: string;
  [key: string]: any;
}

export type TemplateFormValues = Omit<CheckTemplate, "id">;

export interface RecordFilterState {
  aircraftType: string;
  ataChapter: string;
  status: string;
  hasReleaseReview: "" | "yes" | "no";
}

export interface UseRecordsOptions {
  activeRole?: UserRole;
  workflowConfigs?: WorkflowConfig[];
  networkStatus?: "online" | "offline";
  onOfflineSave?: (label: string) => void;
  onRecordStatusChange?: (
    recordId: string,
    fromStatus: string,
    toStatus: string,
    remark?: string
  ) => Promise<void>;
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

const emptyRecordFilter: RecordFilterState = {
  aircraftType: "",
  ataChapter: "",
  status: "",
  hasReleaseReview: ""
};

export function useRecords(options: UseRecordsOptions = {}) {
  const {
    activeRole = "维修工程师",
    workflowConfigs = [],
    networkStatus = "online",
    onOfflineSave,
    onRecordStatusChange
  } = options;

  const [templates, setTemplates] = useState<CheckTemplate[]>([]);
  const [reviewRecords, setReviewRecords] = useState<ReviewRecord[]>([]);
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
  const [recordFilters, setRecordFilters] = useState<RecordFilterState>(emptyRecordFilter);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [isExportPreviewOpen, setIsExportPreviewOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "success" | "failed">("idle");
  const [isMatrixDetailOpen, setIsMatrixDetailOpen] = useState(false);
  const [matrixDetailData, setMatrixDetailData] = useState<{
    aircraftType: string;
    ataChapter: string;
    records: ReviewRecord[];
  } | null>(null);

  const loadRecords = async () => {
    const [t, r] = await Promise.all([
      getAllTemplates(),
      getAllRecords()
    ]);
    setTemplates(t);
    setReviewRecords(r);
  };

  const setRecordsFromData = (data: ReviewRecord[]) => {
    setReviewRecords(data);
  };

  const setTemplatesFromData = (data: CheckTemplate[]) => {
    setTemplates(data);
  };

  const showOfflineToast = (label: string) => {
    if (networkStatus === "offline" && onOfflineSave) {
      onOfflineSave(label);
    }
  };

  const currentWorkflowConfig = useMemo(() => {
    if (formValues.aircraftType && formValues.ataChapter && formValues.checkArea) {
      return findWorkflowConfig(workflowConfigs, formValues.aircraftType, formValues.ataChapter, formValues.checkArea);
    }
    return workflowConfigs[0];
  }, [formValues.aircraftType, formValues.ataChapter, formValues.checkArea, workflowConfigs]);

  const availableAircraftTypes = useMemo(() => {
    const types = new Set<string>();
    workflowConfigs.forEach(c => types.add(c.aircraftType));
    return Array.from(types).sort();
  }, [workflowConfigs]);

  const availableAtaChapters = useMemo(
    () => formValues.aircraftType ? 
      workflowConfigs.filter(c => c.aircraftType === formValues.aircraftType).map(c => c.ataChapter).sort()
      : [],
    [formValues.aircraftType, workflowConfigs]
  );

  const availableCheckAreas = useMemo(
    () => formValues.aircraftType && formValues.ataChapter
      ? workflowConfigs.filter(c => c.aircraftType === formValues.aircraftType && c.ataChapter === formValues.ataChapter).map(c => c.checkArea).sort()
      : [],
    [formValues.aircraftType, formValues.ataChapter, workflowConfigs]
  );

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

  const getFormFieldValue = (key: string): string => {
    return formValues[key] || "";
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

  const allAircraftTypes = useMemo(() => {
    const types = new Set<string>();
    reviewRecords.forEach(r => types.add(r.aircraftType));
    return Array.from(types).sort();
  }, [reviewRecords]);

  const allAtaChapters = useMemo(() => {
    const chapters = new Set<string>();
    reviewRecords.forEach(r => chapters.add(r.ataChapter));
    return Array.from(chapters).sort();
  }, [reviewRecords]);

  const allStatuses = useMemo(() => {
    const statuses = new Set<string>();
    reviewRecords.forEach(r => statuses.add(r.status));
    return Array.from(statuses).sort();
  }, [reviewRecords]);

  const availableAtaChapterOptions = useMemo(() => {
    if (!recordFilters.aircraftType) return allAtaChapters;
    const chapters = new Set<string>();
    reviewRecords
      .filter(r => r.aircraftType === recordFilters.aircraftType)
      .forEach(r => chapters.add(r.ataChapter));
    return Array.from(chapters).sort();
  }, [reviewRecords, recordFilters.aircraftType, allAtaChapters]);

  const filteredRecords = useMemo(() => {
    let result = reviewRecords;

    if (recordFilters.aircraftType) {
      result = result.filter(r => r.aircraftType === recordFilters.aircraftType);
    }

    if (recordFilters.ataChapter) {
      result = result.filter(r => r.ataChapter === recordFilters.ataChapter);
    }

    if (recordFilters.status) {
      result = result.filter(r => r.status === recordFilters.status);
    }

    return result;
  }, [reviewRecords, recordFilters]);

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

  const reviewStats = useMemo(() => {
    return {
      getStats: (records: ReviewRecord[]) => {
        const total = records.length;
        let defect = 0;
        let pending = 0;
        let normal = 0;
        records.forEach(r => {
          if (r.status.includes("缺陷")) defect++;
          else if (r.status.includes("待复核")) pending++;
          else normal++;
        });
        return { total, defect, pending, normal };
      }
    };
  }, []);

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

  const findRecordWorkflowConfig = (record: ReviewRecord): WorkflowConfig | undefined => {
    if (record.workflowConfigId) {
      const byId = workflowConfigs.find(c => c.id === record.workflowConfigId);
      if (byId) return byId;
    }
    const byMatch = findWorkflowConfig(workflowConfigs, record.aircraftType, record.ataChapter, record.checkArea);
    if (byMatch) return byMatch;
    return undefined;
  };

  const handleStatusTransition = async (
    recordId: string,
    transitionIndex: number,
    releaseReviews: Record<string, any>,
    defects: Record<string, any>,
    onDefectCreate?: (record: ReviewRecord) => void,
    onDefectUpdate?: (defect: any) => void
  ) => {
    const record = reviewRecords.find(r => r.id === recordId);
    if (!record) return;
    const config = findRecordWorkflowConfig(record);
    if (!config) {
      alert("未找到该记录对应的工作流配置");
      return;
    }
    const transitions = getAvailableStatusTransitions(config, record.status, activeRole);
    const transition = transitions[transitionIndex];
    if (!transition) {
      alert("无效的状态流转操作");
      return;
    }
    const requiredFieldKeys = transition.requiredFields ?? [];
    if (requiredFieldKeys.length > 0) {
      const requiredFieldConfigs = requiredFieldKeys
        .map(key => config.fields.find(f => f.key === key))
        .filter((f): f is FieldConfig => Boolean(f));
      const recordData = record as unknown as Record<string, string>;
      const missingFields: string[] = [];
      requiredFieldConfigs.forEach(field => {
        const value = recordData[field.key] || "";
        if (value.trim() === "") {
          missingFields.push(field.label);
        }
      });
      if (missingFields.length > 0) {
        alert(`执行"${transition.label}"前请填写：${missingFields.join("、")}`);
        return;
      }
    }
    const confirmed = window.confirm(
      `确认执行"${transition.label}"操作？\n状态将从「${transition.from}」变更为「${transition.to}」`
    );
    if (!confirmed) return;
    const fromStatus = record.status;
    const toStatus = transition.to;
    try {
      const updatedRecord = { ...record, status: toStatus };
      const versionedRecord = await updateRecord(updatedRecord);
      setReviewRecords(prev => prev.map(r => r.id === recordId ? versionedRecord : r));
      if (onRecordStatusChange) {
        await onRecordStatusChange(
          recordId,
          fromStatus,
          toStatus,
          `${activeRole}执行"${transition.label}"操作`
        );
      }
      if (toStatus === "缺陷" && onDefectCreate) {
        const existingDefect = Object.values(defects).find((d: any) => d.sourceRecordId === recordId);
        if (!existingDefect) {
          onDefectCreate(versionedRecord);
        }
      }
      if (fromStatus === "缺陷" && toStatus === "正常" && onDefectUpdate) {
        const relatedDefect = Object.values(defects).find(
          (d: any) => d.sourceRecordId === recordId && (d.status === "pending" || d.status === "processing")
        );
        if (relatedDefect) {
          const now = Date.now();
          const updatedDefect = {
            ...relatedDefect,
            status: "completed",
            completedNote: `关联检查记录状态已流转为"正常"，缺陷自动关闭`,
            completedAt: now,
            updatedAt: now
          };
          onDefectUpdate(updatedDefect);
        }
      }
      if (releaseReviews[recordId] && toStatus === "待复核") {
        // 清除已有复核记录的逻辑由外部处理
      }
    } catch (error) {
      console.error("Failed to execute status transition:", error);
    }
  };

  const handleAddRecord = async () => {
    const config = currentWorkflowConfig;
    const formData = formValues as unknown as Record<string, string>;
    const visibleFields = getVisibleFields(config);
    const baseValidation = validateRequiredFields(visibleFields, formData);
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
      handling: formValues.handling,
      workflowConfigId: currentWorkflowConfig?.id
    };

    const formAny = formValues as Record<string, any>;
    const baseKeys = new Set([
      "aircraftType", "ataChapter", "checkArea", "checkItem",
      "status", "defectDesc", "handling", "signer"
    ]);
    const visibleFieldKeys = new Set(visibleFields.map(field => field.key));
    Array.from(visibleFieldKeys).forEach(key => {
      if (!baseKeys.has(key) && formAny[key] !== undefined && formAny[key] !== null && String(formAny[key]).trim() !== "") {
        (newRecord as any)[key] = formAny[key];
      }
    });
    if (formAny.signer && formAny.signer.trim()) {
      newRecord.signer = formAny.signer;
    }

    try {
      const versionedRecord = await addRecord(newRecord);
      setReviewRecords(prev => [...prev, versionedRecord]);
      if (onRecordStatusChange) {
        await onRecordStatusChange(newRecord.id, "新建", formValues.status, `${activeRole}提交检查记录`);
      }
      showOfflineToast("新增记录已暂存本地");
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

  const updateRecordItem = (record: ReviewRecord) => {
    setReviewRecords(prev => prev.map(r => r.id === record.id ? record : r));
  };

  const addRecordItem = (record: ReviewRecord) => {
    setReviewRecords(prev => [...prev, record]);
  };

  const removeRecordItem = (recordId: string) => {
    setReviewRecords(prev => prev.filter(r => r.id !== recordId));
  };

  return {
    templates,
    reviewRecords,
    formValues,
    isModalOpen,
    editingTemplate,
    isTemplateFromRecord,
    templateForm,
    recordFilters,
    activeFilter,
    isExportPreviewOpen,
    copyStatus,
    isMatrixDetailOpen,
    matrixDetailData,
    currentWorkflowConfig,
    availableAircraftTypes,
    availableAtaChapters,
    availableCheckAreas,
    allowedStatusOptions,
    allAircraftTypes,
    allAtaChapters,
    allStatuses,
    availableAtaChapterOptions,
    filteredRecords,
    matrixData,
    setActiveFilter,
    setIsExportPreviewOpen,
    setCopyStatus,
    setFormValues,
    setRecordFilters,
    setRecordsFromData,
    setTemplatesFromData,
    loadRecords,
    getFormFieldValue,
    handleFormFieldChange,
    getVisibleFields,
    handleRecordFilterChange,
    resetRecordFilters,
    reviewStats,
    getCellStatus,
    handleMatrixCellClick,
    closeMatrixDetail,
    findRecordWorkflowConfig,
    handleStatusTransition,
    handleAddRecord,
    handleTemplateFormChange,
    openNewModal,
    openEditModal,
    openSaveAsTemplateModal,
    closeModal,
    isTemplateNameDuplicate,
    saveTemplate,
    deleteTemplate,
    applyTemplate,
    updateRecordItem,
    addRecordItem,
    removeRecordItem
  };
}
