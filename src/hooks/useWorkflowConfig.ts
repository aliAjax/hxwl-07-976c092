import { useState, useMemo } from "react";
import {
  WorkflowConfig,
  FieldConfig,
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
  getStatusCategory,
  getRoleVisibleFields,
  canRolePerformAction,
  getRoleEditableFields,
  getRoleSpecificMetrics,
  getRoleDescription
} from "../workflow";
import {
  workflowConfigs as builtInConfigs,
  getGlobalMetrics,
  getGlobalFilters
} from "../workflowConfigs";
import {
  getAllWorkflowConfigs,
  saveWorkflowConfig,
  deleteWorkflowConfig,
  seedWorkflowConfigs,
  createDefaultConfig,
  resetWorkflowConfigsToDefault
} from "../workflowConfigDB";

export type UserRole = "维修工程师" | "放行人员" | "培训教员";

export interface UseWorkflowConfigOptions {
  activeRole?: UserRole;
}

export function useWorkflowConfig(options: UseWorkflowConfigOptions = {}) {
  const { activeRole = "维修工程师" } = options;

  const [workflowConfigsState, setWorkflowConfigsState] = useState<WorkflowConfig[]>(builtInConfigs);
  const [isConfigManagerOpen, setIsConfigManagerOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<WorkflowConfig | null>(null);
  const [newConfigAircraftType, setNewConfigAircraftType] = useState("");
  const [newConfigAtaChapter, setNewConfigAtaChapter] = useState("");
  const [newConfigCheckArea, setNewConfigCheckArea] = useState("");

  const loadWorkflowConfigs = async () => {
    await seedWorkflowConfigs();
    const configs = await getAllWorkflowConfigs();
    setWorkflowConfigsState(configs);
  };

  const setConfigsFromData = (data: WorkflowConfig[]) => {
    setWorkflowConfigsState(data);
  };

  const globalMetrics = useMemo(() => getGlobalMetrics(), []);
  const globalFilters = useMemo(() => getGlobalFilters(), []);

  const findWorkflowConfig = (aircraftType: string, ataChapter: string, checkArea: string): WorkflowConfig | undefined => {
    const { findWorkflowConfig: findConfig } = require("../workflow");
    return findConfig(workflowConfigsState, aircraftType, ataChapter, checkArea);
  };

  const getAllAircraftTypesList = useMemo(
    () => getAllAircraftTypes(workflowConfigsState),
    [workflowConfigsState]
  );

  const globalMetricsValue = globalMetrics;
  const globalFiltersValue = globalFilters;

  const handleAddWorkflowConfig = async () => {
    if (!newConfigAircraftType.trim() || !newConfigAtaChapter.trim() || !newConfigCheckArea.trim()) {
      alert("请填写机型、ATA章节和检查区域");
      return;
    }
    const exists = workflowConfigsState.find(
      c => c.aircraftType === newConfigAircraftType.trim() &&
           c.ataChapter === newConfigAtaChapter.trim() &&
           c.checkArea === newConfigCheckArea.trim()
    );
    if (exists) {
      alert("该机型/ATA章节/检查区域的配置已存在");
      return;
    }
    const newConfig = createDefaultConfig(newConfigAircraftType.trim(), newConfigAtaChapter.trim(), newConfigCheckArea.trim());
    await saveWorkflowConfig(newConfig);
    const configs = await getAllWorkflowConfigs();
    setWorkflowConfigsState(configs);
    setNewConfigAircraftType("");
    setNewConfigAtaChapter("");
    setNewConfigCheckArea("");
  };

  const handleDeleteWorkflowConfig = async (id: string) => {
    const confirmed = window.confirm("确认删除此工作流配置？已有记录的展示将退回到兼容模式。");
    if (!confirmed) return;
    await deleteWorkflowConfig(id);
    const configs = await getAllWorkflowConfigs();
    setWorkflowConfigsState(configs);
  };

  const handleSaveEditingConfig = async () => {
    if (!editingConfig) return;
    await saveWorkflowConfig(editingConfig);
    const configs = await getAllWorkflowConfigs();
    setWorkflowConfigsState(configs);
    setEditingConfig(null);
  };

  const handleResetWorkflowConfigs = async () => {
    const confirmed = window.confirm("确认恢复默认工作流配置？自定义配置将被清除。");
    if (!confirmed) return;
    const configs = await resetWorkflowConfigsToDefault();
    setWorkflowConfigsState(configs);
  };

  const getAvailableStatusTransitionsForRecord = (config: WorkflowConfig, status: string) => {
    return getAvailableStatusTransitions(config, status, activeRole);
  };

  const getRoleVisibleFieldsForConfig = (config: WorkflowConfig | undefined): FieldConfig[] => {
    return getRoleVisibleFields(config, activeRole);
  };

  const canRoleEditFieldForConfig = (config: WorkflowConfig | undefined, fieldKey: string): boolean => {
    if (!config) return false;
    return canRoleEditField(config, fieldKey, activeRole);
  };

  const canRolePerformActionForConfig = (config: WorkflowConfig | undefined, action: "create" | "edit" | "review" | "createDefect" | "addComment"): boolean => {
    return canRolePerformAction(config, activeRole, action);
  };

  const getRoleEditableFieldsForConfig = (config: WorkflowConfig | undefined): string[] => {
    return getRoleEditableFields(config, activeRole);
  };

  const getRoleSpecificMetricsForConfig = (metrics: any[]) => {
    return getRoleSpecificMetrics(metrics, activeRole);
  };

  const getInitialStatusForConfig = (config: WorkflowConfig | undefined): string => {
    return getInitialStatus(config);
  };

  return {
    workflowConfigs: workflowConfigsState,
    isConfigManagerOpen,
    editingConfig,
    newConfigAircraftType,
    newConfigAtaChapter,
    newConfigCheckArea,
    globalMetrics: globalMetricsValue,
    globalFilters: globalFiltersValue,
    allAircraftTypes: getAllAircraftTypesList,
    setIsConfigManagerOpen,
    setEditingConfig,
    setNewConfigAircraftType,
    setNewConfigAtaChapter,
    setNewConfigCheckArea,
    setWorkflowConfigsState,
    setConfigsFromData,
    loadWorkflowConfigs,
    findWorkflowConfig,
    handleAddWorkflowConfig,
    handleDeleteWorkflowConfig,
    handleSaveEditingConfig,
    handleResetWorkflowConfigs,
    getAvailableStatusTransitionsForRecord,
    getRoleVisibleFieldsForConfig,
    canRoleEditFieldForConfig,
    canRolePerformActionForConfig,
    getRoleEditableFieldsForConfig,
    getRoleSpecificMetricsForConfig,
    getInitialStatusForConfig,
    getStatusCategory,
    validateRequiredFields,
    calculateMetricValue,
    getMatrixCellStatus,
    getRecordDisplayFields,
    canCreateDefect,
    getRoleDescription
  };
}
