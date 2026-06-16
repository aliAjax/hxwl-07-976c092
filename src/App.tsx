import { useState, useMemo } from "react";
import "./styles.css";

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
  ] as UserRole[],
  "metrics": [
    "完成率",
    "缺陷项",
    "待复核",
    "ATA章节"
  ],
  "filters": [
    "机体",
    "动力装置",
    "航电",
    "起落架"
  ],
  "fields": [
    "机型",
    "ATA章节",
    "检查区域",
    "检查项目",
    "缺陷描述",
    "处理意见",
    "签署人"
  ],
  "records": [
    [
      "A320",
      "ATA 32",
      "起落架",
      "待复核",
      "主轮磨耗接近限制"
    ],
    [
      "B737",
      "ATA 24",
      "电源系统",
      "正常",
      "正常",
      "正常",
      "完成"
    ],
    [
      "ARJ21",
      "ATA 27",
      "飞控",
      "缺陷",
      "副翼作动测试需复查"
    ]
  ]
};

interface CheckTemplate {
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

type TemplateFormValues = Omit<CheckTemplate, "id">;

interface FormValues {
  aircraftType: string;
  ataChapter: string;
  checkArea: string;
  checkItem: string;
  defectDesc: string;
  handling: string;
  signer: string;
}

interface ReviewRecord {
  id: string;
  aircraftType: string;
  ataChapter: string;
  checkArea: string;
  status: string;
  defectDesc: string;
  handling: string;
}

interface ReviewState {
  [recordId: string]: string;
}

const initialTemplates: CheckTemplate[] = [
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

const emptyForm: FormValues = {
  aircraftType: "",
  ataChapter: "",
  checkArea: "",
  checkItem: "",
  defectDesc: "",
  handling: "",
  signer: ""
};

const statusColors = ["status-ok", "status-watch", "status-danger"];

function parseReviewRecords(records: string[][]): ReviewRecord[] {
  return records.map((record, index) => {
    const aircraftType = record[0] || "";
    const ataChapter = record[1] || "";
    const checkArea = record[2] || "";
    const status = record[3] || "";
    const defectDesc = record[4] || "";
    const handling = record[5] || "";
    return {
      id: `review-${index}`,
      aircraftType,
      ataChapter,
      checkArea,
      status,
      defectDesc,
      handling
    };
  });
}

function getStatusBadgeClass(status: string): string {
  const s = status.toLowerCase();
  if (s.includes("正常") || s.includes("完成")) return "status-badge-ok";
  if (s.includes("待复核") || s.includes("待")) return "status-badge-watch";
  if (s.includes("缺陷")) return "status-badge-danger";
  return "status-badge-default";
}

function MetricCard({ label, value, index }: { label: string; value: string; index: number }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <i className={statusColors[index % statusColors.length]} />
    </article>
  );
}

function App() {
  const values = project.metrics.map((metric: string, index: number) => {
    const base = [84, 12, 31, 7][index % 4];
    return String(base + index * 3);
  });

  const [templates, setTemplates] = useState<CheckTemplate[]>(initialTemplates);
  const [formValues, setFormValues] = useState<FormValues>(emptyForm);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<CheckTemplate | null>(null);
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
  const [reviewNotes, setReviewNotes] = useState<ReviewState>({});
  const [isExportPreviewOpen, setIsExportPreviewOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "success" | "failed">("idle");

  const reviewRecords = useMemo(() => parseReviewRecords(project.records), []);

  const reviewStats = useMemo(() => {
    const total = reviewRecords.length;
    let defect = 0;
    let pending = 0;
    let normal = 0;
    let commented = 0;
    reviewRecords.forEach(r => {
      if (r.status.includes("缺陷")) defect++;
      else if (r.status.includes("待复核")) pending++;
      else normal++;
      if (reviewNotes[r.id] && reviewNotes[r.id].trim().length > 0) commented++;
    });
    return { total, defect, pending, normal, commented };
  }, [reviewRecords, reviewNotes]);

  const handleReviewNoteChange = (recordId: string, value: string) => {
    setReviewNotes(prev => ({ ...prev, [recordId]: value }));
  };

  const handleFormChange = (field: keyof FormValues, value: string) => {
    setFormValues(prev => ({ ...prev, [field]: value }));
  };

  const handleTemplateFormChange = (field: keyof TemplateFormValues, value: string) => {
    setTemplateForm(prev => ({ ...prev, [field]: value }));
  };

  const openNewModal = () => {
    setEditingTemplate(null);
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

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingTemplate(null);
  };

  const saveTemplate = () => {
    if (templateForm.name.trim() === "") return;

    if (editingTemplate) {
      setTemplates(prev =>
        prev.map(t =>
        t.id === editingTemplate.id
          ? { ...t, ...templateForm }
          : t
      )
    );
    } else {
      const newTemplate: CheckTemplate = {
        id: String(Date.now()),
        ...templateForm
      };
      setTemplates(prev => [...prev, newTemplate]);
    }
    closeModal();
  };

  const deleteTemplate = (id: string) => {
    setTemplates(prev => prev.filter(t => t.id !== id));
  };

  const applyTemplate = (template: CheckTemplate) => {
    setFormValues({
      aircraftType: template.aircraftType,
      ataChapter: template.ataChapter,
      checkArea: template.checkArea,
      checkItem: template.checkItem,
      defectDesc: template.defectDesc,
      handling: template.handling,
      signer: template.signer
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

  return (
    <main className="app-shell">
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
        {project.metrics.map((metric: string, index: number) => (
          <MetricCard key={metric} label={metric} value={values[index]} index={index} />
        ))}
      </section>

      <section className="workspace">
        <aside className="panel narrow">
          <h2>角色</h2>
          <div className="chips">
            {project.users.map((user: UserRole) => (
              <button
                key={user}
                className={activeRole === user ? "chip-active" : ""}
                onClick={() => setActiveRole(user)}
              >
                {user}
              </button>
            ))}
          </div>
          <h2>筛选</h2>
          <div className="chips muted">
            {project.filters.map((filter: string) => (
              <button key={filter}>{filter}</button>
            ))}
          </div>
        </aside>

        <section className="panel">
          <div className="section-heading">
            <div>
              <p>{project.domain}</p>
              <h2>记录字段</h2>
            </div>
            <button className="primary-action">新增记录</button>
          </div>
          <div className="field-grid">
            <label>
              <span>机型</span>
              <input
                placeholder="填写机型"
                value={formValues.aircraftType}
                onChange={e => handleFormChange("aircraftType", e.target.value)}
              />
            </label>
            <label>
              <span>ATA章节</span>
              <input
                placeholder="填写ATA章节"
                value={formValues.ataChapter}
                onChange={e => handleFormChange("ataChapter", e.target.value)}
              />
            </label>
            <label>
              <span>检查区域</span>
              <input
                placeholder="填写检查区域"
                value={formValues.checkArea}
                onChange={e => handleFormChange("checkArea", e.target.value)}
              />
            </label>
            <label>
              <span>检查项目</span>
              <input
                placeholder="填写检查项目"
                value={formValues.checkItem}
                onChange={e => handleFormChange("checkItem", e.target.value)}
              />
            </label>
            <label>
              <span>缺陷描述</span>
              <input
                placeholder="填写缺陷描述"
                value={formValues.defectDesc}
                onChange={e => handleFormChange("defectDesc", e.target.value)}
              />
            </label>
            <label>
              <span>处理意见</span>
              <input
                placeholder="填写处理意见"
                value={formValues.handling}
                onChange={e => handleFormChange("handling", e.target.value)}
              />
            </label>
            <label className="full-width">
              <span>签署人</span>
              <input
                placeholder="填写签署人"
                value={formValues.signer}
                onChange={e => handleFormChange("signer", e.target.value)}
              />
            </label>
          </div>
        </section>
      </section>

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
                    <button className="apply-btn" onClick={() => applyTemplate(template)}>
                      应用模板
                    </button>
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

      {activeRole === "培训教员" ? (
        <section className="review-panel">
          <div className="section-heading">
            <div>
              <p>培训讲评</p>
              <h2>检查讲评视图</h2>
            </div>
            <div className="review-actions">
              <button className="review-summary-btn">
                讲评进度 {reviewStats.commented}/{reviewStats.total}
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
              <strong>{reviewStats.commented}</strong>
            </div>
          </div>

          <div className="review-list">
            {reviewRecords.map((record, index) => (
              <article key={record.id} className="review-card">
                <div className="review-card-header">
                  <div className="review-card-index">{String(index + 1).padStart(2, "0")}</div>
                  <div className="review-card-title">
                    <div className="review-card-top">
                      <h3>{record.aircraftType}</h3>
                      <span className={`status-badge ${getStatusBadgeClass(record.status)}`}>
                        {record.status}
                      </span>
                    </div>
                    <div className="review-card-meta">
                      <span className="meta-tag">{record.ataChapter}</span>
                      <span className="meta-tag meta-tag-muted">{record.checkArea}</span>
                    </div>
                  </div>
                </div>

                <div className="review-card-body">
                  <div className="defect-section">
                    <div className="section-label">缺陷说明</div>
                    <div className="defect-content">
                      {record.defectDesc ? record.defectDesc : "无缺陷描述"}
                    </div>
                  </div>

                  <div className="comment-section">
                    <div className="section-label">
                      讲评备注
                      {reviewNotes[record.id]?.trim().length > 0 && (
                        <span className="comment-indicator">已填写</span>
                      )}
                    </div>
                    <textarea
                      className="comment-textarea"
                      placeholder="请输入培训讲评意见，例如：针对该缺陷的处置要点、常见问题、注意事项..."
                      rows={3}
                      value={reviewNotes[record.id] || ""}
                      onChange={e => handleReviewNoteChange(record.id, e.target.value)}
                    />
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : (
        <section className="records panel">
          <div className="section-heading">
            <div>
              <p>示例数据</p>
              <h2>近期记录</h2>
            </div>
            <button onClick={openExportPreview}>导出摘要</button>
          </div>
          <div className="record-list">
            {project.records.map((record: string[], index: number) => (
              <article key={record.join("-")} className="record-card">
                <div className="record-index">{String(index + 1).padStart(2, "0")}</div>
                <div>
                  <h3>{record[0]}</h3>
                  <p>{record.slice(1).join(" · ")}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {isModalOpen && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingTemplate ? "编辑模板" : "新增模板"}</h2>
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
