(function () {
  var Q = window.QwenPaw;
  if (!Q || !Q.host || !Q.host.React || !Q.registerRoutes) return;
  var React = Q.host.React, antd = Q.host.antd, h = React.createElement;

  function zySpark() { return h("span", { style: { fontSize: 13 } }, "\u2726"); }
  function zyPushAgent(context) {
    if (Q.setAgentContext) Q.setAgentContext(context);
    else window.dispatchEvent(new CustomEvent("qwenpaw:agent-context", { detail: context }));
  }
  function AgentDock(props) {
    var listRef = React.useRef(null);
    React.useEffect(function () {
      if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
    }, [props.messages]);
    if (!props.open) return null;
    var S = {
      mask: { position: "fixed", inset: 0, background: "rgba(15,23,42,0.32)", zIndex: 1200 },
      dock: { position: "fixed", top: 0, right: 0, bottom: 0, width: "min(420px,92vw)", background: "#ffffff", borderLeft: "1px solid #e3e8ef", boxShadow: "-10px 0 30px rgba(16,24,40,0.16)", zIndex: 1201, display: "flex", flexDirection: "column" },
      chat: { display: "flex", flexDirection: "column", height: "100%" },
      head: { padding: "14px 16px", background: "#ffffff", borderBottom: "1px solid #e3e8ef" },
      close: { border: "none", background: "transparent", cursor: "pointer", fontSize: 18, lineHeight: 1, color: "#98a2b3", padding: "4px 8px", borderRadius: 6 },
      list: { flex: "1 1 auto", overflow: "auto", padding: 16 },
      msg: { display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 },
      bubble: { maxWidth: "92%", padding: "10px 12px", borderRadius: 11, fontSize: "12.5px", lineHeight: 1.6, boxShadow: "0 1px 2px rgba(16,24,40,0.04)", whiteSpace: "pre-wrap" },
      card: { maxWidth: "92%", background: "#ffffff", border: "1px solid #e3e8ef", borderRadius: 11, padding: "12px 14px", boxShadow: "0 1px 2px rgba(16,24,40,0.04)", fontSize: 12.5 },
      input: { padding: "12px 14px", background: "#ffffff", borderTop: "1px solid #e3e8ef" },
      chips: { display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 },
      chip: { border: "1px solid #e3e8ef", background: "#ffffff", borderRadius: 999, padding: "6px 12px", fontSize: 12, color: "#5b6472", cursor: "pointer" }
    };
    return h("div", null,
      h("div", { style: S.mask, onClick: props.onClose }),
      h("div", { style: S.dock },
        h("div", { style: S.chat },
          h("div", { style: S.head },
            h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 } },
              h("span", { style: { fontWeight: 650, fontSize: 15, color: "#1f2933" } }, "智能体助手 · " + (props.moduleLabel || "")),
              h("button", { "aria-label": "close", onClick: props.onClose, style: S.close }, "\u2715")
            ),
            h("div", { style: { fontSize: 12, color: "#5b6472", marginTop: 8, lineHeight: 1.5 } }, "直接打字告诉我要做什么，或点击下方快捷指令，自动载入示例并交给智能体处理。"),
            h("div", { style: S.chips },
              (props.chips || []).map(function (c) {
                return h("span", { key: c.key, style: S.chip, onClick: function () { props.onCommand(c.key, c.label); } }, c.label);
              })
            )
          ),
          h("div", { style: S.list, ref: listRef },
            (props.messages || []).map(function (msg, i) {
              var user = msg.role === "user";
              return h("div", { key: i, style: Object.assign({}, S.msg, user ? { alignItems: "flex-end" } : { alignItems: "flex-start" }) },
                h("div", { style: Object.assign({}, S.bubble, user ? { background: "#2563eb", color: "#fff", borderBottomRightRadius: 3 } : { background: "#ffffff", border: "1px solid #e3e8ef", color: "#1f2933", borderBottomLeftRadius: 3 }) }, msg.text),
                msg.card ? h("div", { style: S.card }, msg.card) : null
              );
            })
          ),
          h("div", { style: S.input },
            h(antd.Input, { value: props.draft, placeholder: props.placeholder || "例如：分析当前订单交付风险", onChange: function (e) { props.setDraft(e.target.value); }, onPressEnter: function (e) { if (props.draft.trim()) { props.onSend(props.draft); e.preventDefault(); } } }),
            h(antd.Button, { type: "primary", style: { marginTop: 10, width: "100%" }, loading: props.busy, onClick: function () { if (props.draft.trim()) props.onSend(props.draft); } }, "发送")
          )
        )
      )
    );
  }

  function request(path, options) { return Q.host.fetch(path, options).then(function (response) { return response.json().catch(function () { return {}; }).then(function (body) { if (!response.ok) throw new Error(body.detail || ("HTTP " + response.status)); return body; }); }); }
  function json(value) { return { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) }; }

  function IntegrationHub() {

    var agentOpenState = React.useState(false), agentOpen = agentOpenState[0], setAgentOpen = agentOpenState[1];
    var agentDraftState = React.useState(""), agentDraft = agentDraftState[0], setAgentDraft = agentDraftState[1];
    var agentMsgState = React.useState([]), agentMessages = agentMsgState[0], setAgentMessages = agentMsgState[1];
    var agentBusyState = React.useState(false), agentBusy = agentBusyState[0], setAgentBusy = agentBusyState[1];
    var agentSessionRef = React.useRef("app-dock-" + Date.now().toString(36));
    function agentAdd(role, text, card) { setAgentMessages(function (prev) { return prev.concat([{ role: role, text: text, card: card }]); }); }
    function agentCommand(key, label) {
      var prompts = {"mapping":"请检查这条集成记录的字段映射是否正确。","preview":"请预览该来源数据的字段与样本。","sync":"请查看当前集成同步状态并说明。"};
      var prompt = prompts[key] || (label || key);
      startAgentChat(prompt);
    }
    function startAgentChat(text) {
      text = String(text == null ? "" : text).trim();
      if (!text || agentBusy) return;
      var history = (agentMessages || []).filter(function (m) { return m && m.role !== "system"; }).map(function (m) { return { role: m.role === "bot" ? "assistant" : "user", text: m.text || "" }; }).slice(-12);
      agentAdd("user", text, null);
      agentAdd("bot", "", null);
      setAgentBusy(true);
      zyPushAgent({ app_id: "zhiyun-integration-hub", kind: "chat", label: text, summary: {}, source_type: "real" });
      function setLastBot(value) {
        setAgentMessages(function (prev) { var next = prev.slice(); next[next.length - 1] = { role: "bot", text: value, card: null }; return next; });
      }
      var full = "";
      Q.host.fetch("/zhiyun-integration-hub/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text, session_id: agentSessionRef.current, user_id: "default", history: history })
      })
      .then(function (response) {
        if (!response.ok || !response.body) {
          return response.text().then(function (t) { throw new Error("HTTP " + response.status + (t && t.trim() ? ": " + t.trim() : "")); });
        }
        var reader = response.body.getReader();
        var decoder = new TextDecoder();
        var buffer = "";
        function read() {
          return reader.read().then(function (chunk) {
            if (chunk.done) return;
            buffer += decoder.decode(chunk.value, { stream: true });
            var lines = buffer.split("\n");
            buffer = lines.pop();
            lines.forEach(function (line) {
              line = line.trim();
              if (line.indexOf("data: ") !== 0) return;
              var raw = line.slice(6).trim();
              if (!raw || raw === "[DONE]") return;
              var event;
              try { event = JSON.parse(raw); } catch (e) { return; }
              if (event.error) {
                if (!full) { full = "智能体返回失败：" + event.error; setLastBot(full); }
                return;
              }
              if (event.type === "text" && event.delta && typeof event.text === "string" && event.text) {
                full += event.text;
                setLastBot(full);
              }
              if (event.type === "message" && event.status === "completed" && Array.isArray(event.content)) {
                for (var i = 0; i < event.content.length; i++) {
                  var part = event.content[i];
                  if (part && part.type === "text" && !part.delta && typeof part.text === "string" && part.text) {
                    full = part.text;
                    setLastBot(full);
                  }
                }
              }
              if (event.status === "failed" && !full) {
                full = event.error || "智能体返回失败";
                setLastBot(full);
              }
            });
            return read();
          });
        }
        return read();
      })
      .then(function () {
        setAgentBusy(false);
        if (!full) setLastBot("（智能体未返回可显示内容）");
      })
      .catch(function (err) {
        setAgentBusy(false);
        setLastBot("调用智能体失败：" + (err && err.message ? err.message : String(err)));
      });
    }

    var healthState = React.useState(null), health = healthState[0], setHealth = healthState[1];
    var kindState = React.useState("file"), kind = kindState[0], setKind = kindState[1];
    var sourceState = React.useState(null), source = sourceState[0], setSource = sourceState[1];
    var mappingState = React.useState({}), mapping = mappingState[0], setMapping = mappingState[1];
    var resultState = React.useState(null), result = resultState[0], setResult = resultState[1];
    var pendingState = React.useState(null), pending = pendingState[0], setPending = pendingState[1];
    var loadingState = React.useState(false), loading = loadingState[0], setLoading = loadingState[1];
    var guideState = React.useState(false), guide = guideState[0], setGuide = guideState[1];
    var readGeneration = React.useRef(0);
    var form = antd.Form.useForm()[0], message = antd.App.useApp().message;
    React.useEffect(function () { request("/zhiyun-integration-hub/health").then(setHealth).catch(function (error) { setHealth({ status: "degraded", reason: error.message }); }); }, []);
    function selectedConfig(values) {
      if (kind === "file") { var file = values.file && values.file.fileList && values.file.fileList[0] && values.file.fileList[0].originFileObj; if (!file) throw new Error("请选择 CSV 或 JSON 文件"); return { config: { filename: file.name }, file: file }; }
      if (kind === "api") return { config: { url: values.api_url, secret_env: values.secret_env || undefined } };
      return { config: { path: values.sqlite_path, table: values.sqlite_table } };
    }
    function readAndMatch() {
      form.validateFields().then(function (values) {
        var generation = ++readGeneration.current;
        var selected = selectedConfig(values); setLoading(true); setSource(null); setPending(null); setResult(null);
        return request("/zhiyun-integration-hub/connectors", json({ name: values.name, kind: kind, config: selected.config })).then(function (connector) {
          if (kind === "file") { var data = new FormData(); data.append("file", selected.file); return request("/zhiyun-integration-hub/files/parse", { method: "POST", body: data }).then(function (payload) { return { connector: connector, payload: payload }; }); }
          return request("/zhiyun-integration-hub/sources/read", json({ kind: kind, config: selected.config })).then(function (payload) { return { connector: connector, payload: payload }; });
        }).then(function (context) {
          return request("/zhiyun-data-core/schemas/" + encodeURIComponent(values.entity)).then(function (schema) {
            if (generation !== readGeneration.current) return;
            var fields = (schema.fields || []).filter(function (field) { return field.active !== false; });
            var headers = context.payload.headers || Array.from(new Set((context.payload.rows || []).reduce(function (all, row) { return all.concat(Object.keys(row || {})); }, []))), next = {};
            headers.forEach(function (header) { var key = String(header).trim().toLowerCase(); var match = fields.find(function (field) { return String(field.name).toLowerCase() === key || String(field.label || "").trim().toLowerCase() === key; }); if (match) next[header] = match.name; });
            setMapping(next); setSource({ connector: context.connector, rows: context.payload.rows || [], headers: headers, fields: fields, entity: values.entity });
            message.success("读取成功，已自动匹配 " + Object.keys(next).length + " 个字段");
          });
        });
      }).catch(function (error) { message.error(error.message || "读取失败"); }).finally(function () { setLoading(false); });
    }
    function preview() {
      if (!source || !Object.keys(mapping).length) { message.warning("请至少匹配一个字段"); return; }
      setLoading(true); setPending(null); setResult(null);
      request("/zhiyun-integration-hub/sync/preview", json({ connector_id: source.connector.connector_id, entity: source.entity, rows: source.rows, mapping: mapping })).then(function (hub) {
        var dataCore = hub.data_core_request; return request("/zhiyun-data-core/imports/" + encodeURIComponent(dataCore.entity) + "/preview", json(dataCore)).then(function (checked) { setPending({ hub: hub, request: dataCore, preview: checked }); setResult({ trace_id: hub.run.trace_id, data_core_preview: checked }); });
      }).catch(function (error) { message.error(error.message || "预览失败"); }).finally(function () { setLoading(false); });
    }
    function commit() {
      if (!pending) return;
      antd.Modal.confirm({ title: "确认写入统一数据中心？", content: "将写入 " + pending.preview.valid_count + " 条真实记录，并生成可撤销批次。", okText: "确认写入", cancelText: "取消", onOk: function () {
        setLoading(true); return request("/zhiyun-data-core/imports/" + encodeURIComponent(pending.request.entity) + "/commit", json(pending.request)).then(function (imported) { return request("/zhiyun-integration-hub/sync/" + pending.hub.run.run_id + "/commit", json({ output_count: imported.row_count, data_core_batch_id: imported.batch_id, confirmed: true })).then(function (run) { setResult({ message: "同步完成，可在统一数据中心按批次撤销", imported: imported, run: run }); setPending(null); }); }).catch(function (error) { message.error(error.message || "提交失败，运行证据已保留，可修复后重试"); }).finally(function () { setLoading(false); });
      } });
    }
    var options = source ? source.fields.map(function (field) { return { value: field.name, label: (field.label || field.name) + "（" + field.name + "）" }; }) : [];
    return h("div", { style: { padding: 28, height: "100%", overflow: "auto", background: "#f7f8fa" } }, h("div", { style: { maxWidth: 1080, margin: "0 auto" } },
      h("div", { style: { display: "flex", justifyContent: "space-between" } }, h("div", null, h("h2", null, "系统集成中心"), h("p", { style: { color: "#667085" } }, "上传文件或填写连接信息，系统自动读取字段并引导完成同步。")), h(antd.Button, { onClick: function () { setGuide(true); } }, "功能说明书")),
      h(antd.Alert, { type: health && health.status === "available" ? "success" : "warning", showIcon: true, message: health ? ("版本 " + (health.version || "未知") + " · " + (health.status === "available" ? "运行正常" : "依赖异常")) : "正在检查依赖", description: health && health.reason ? health.reason : "外部连接默认只读；写入前必须由你确认。", style: { marginBottom: 16 } }),
      h(antd.Steps, { current: pending ? 2 : source ? 1 : 0, style: { marginBottom: 18 }, items: [{ title: "选择数据来源" }, { title: "核对字段" }, { title: "预览并确认" }] }),
      h(antd.Card, { title: "第一步：选择数据来源", style: { marginBottom: 16 } }, h(antd.Form, { form: form, layout: "vertical", initialValues: { name: "订单数据导入", kind: "file", entity: "orders" }, onValuesChange: function () { readGeneration.current += 1; setSource(null); setPending(null); setResult(null); } },
        h(antd.Row, { gutter: 12 }, h(antd.Col, { span: 12 }, h(antd.Form.Item, { name: "name", label: "连接名称", rules: [{ required: true, message: "请输入连接名称" }] }, h(antd.Input, { placeholder: "例如：ERP 每日订单" }))), h(antd.Col, { span: 12 }, h(antd.Form.Item, { name: "kind", label: "数据来源" }, h(antd.Select, { onChange: function (value) { setKind(value); setSource(null); setPending(null); }, options: [{ value: "file", label: "上传 CSV / JSON 文件" }, { value: "api", label: "连接 HTTPS API" }, { value: "sqlite", label: "读取 SQLite 数据库" }] })))),
        kind === "file" ? h(antd.Form.Item, { name: "file", label: "数据文件", rules: [{ required: true, message: "请选择文件" }] }, h(antd.Upload, { accept: ".csv,.json", beforeUpload: function () { return false; }, maxCount: 1 }, h(antd.Button, null, "选择文件"))) : null,
        kind === "api" ? h(antd.Row, { gutter: 12 }, h(antd.Col, { span: 16 }, h(antd.Form.Item, { name: "api_url", label: "HTTPS 接口地址", rules: [{ required: true, type: "url", message: "请输入有效 HTTPS 地址" }] }, h(antd.Input, { placeholder: "https://example.com/api/orders" }))), h(antd.Col, { span: 8 }, h(antd.Form.Item, { name: "secret_env", label: "密钥环境变量（可选）", tooltip: "只填变量名，不填真实密钥", rules: [{ pattern: /^[A-Z][A-Z0-9_]{2,100}$/, message: "例如 ERP_API_TOKEN" }] }, h(antd.Input, { placeholder: "ERP_API_TOKEN" })))) : null,
        kind === "sqlite" ? h(antd.Row, { gutter: 12 }, h(antd.Col, { span: 14 }, h(antd.Form.Item, { name: "sqlite_path", label: "数据库文件路径", rules: [{ required: true, message: "请输入数据库文件路径" }] }, h(antd.Input, { placeholder: "数据库文件的完整路径" }))), h(antd.Col, { span: 10 }, h(antd.Form.Item, { name: "sqlite_table", label: "数据表", rules: [{ required: true, pattern: /^[A-Za-z_][A-Za-z0-9_]*$/, message: "请输入安全表名" }] }, h(antd.Input, { placeholder: "orders" })))) : null,
        h(antd.Form.Item, { name: "entity", label: "写入的数据类型", rules: [{ required: true }] }, h(antd.Select, { options: [{ value: "orders", label: "订单" }, { value: "production_records", label: "生产记录" }], showSearch: true })),
        h(antd.Button, { type: "primary", loading: loading, onClick: readAndMatch }, "读取数据并自动匹配字段"))),
      source ? h(antd.Card, { title: "第二步：核对字段匹配", style: { marginBottom: 16 }, extra: h(antd.Tag, { color: "blue" }, source.rows.length + " 条记录") }, h(antd.Alert, { type: "info", showIcon: true, message: "系统已按字段名和中文标题自动匹配", description: "未匹配字段不会写入；使用下拉框调整，无需编写 JSON。", style: { marginBottom: 12 } }), h(antd.Table, { size: "small", pagination: false, rowKey: "source", dataSource: source.headers.map(function (name) { return { source: name }; }), columns: [{ title: "来源字段", dataIndex: "source" }, { title: "写入字段", render: function (_, row) { return h(antd.Select, { allowClear: true, placeholder: "忽略此字段", value: mapping[row.source], options: options, style: { width: "100%" }, onChange: function (value) { var next = Object.assign({}, mapping); if (value) next[row.source] = value; else delete next[row.source]; setMapping(next); setPending(null); setResult(null); } }); } }] }), h(antd.Button, { type: "primary", loading: loading, onClick: preview, style: { marginTop: 12 } }, "生成写入预览")) : null,
      pending ? h(antd.Card, { title: "第三步：确认写入", style: { marginBottom: 16 } }, h(antd.Descriptions, { bordered: true, size: "small", items: [{ key: "valid", label: "可写入", children: pending.preview.valid_count + " 条" }, { key: "warning", label: "警告", children: pending.preview.warning_count + " 条" }, { key: "error", label: "错误", children: pending.preview.error_count + " 条" }] }), h(antd.Button, { type: "primary", disabled: pending.preview.error_count > 0, onClick: commit, style: { marginTop: 12 } }, "确认写入统一数据中心")) : null,
    h("div", { style: { display: "flex", justifyContent: "flex-end", marginBottom: 12 } }, h(antd.Button, { type: "primary", onClick: function () { setAgentOpen(true); } }, zySpark(), " 问 Agent")),
      result ? h(antd.Collapse, { items: [{ key: "evidence", label: "查看同步证据与追踪信息", children: h("pre", { style: { whiteSpace: "pre-wrap", overflowWrap: "anywhere" } }, JSON.stringify(result, null, 2)) }] }) : null,
      h(antd.Drawer, { title: "系统集成中心功能说明书", width: 560, open: guide, onClose: function () { setGuide(false); } }, h(antd.Typography.Title, { level: 4 }, "功能介绍"), h("p", null, "把 CSV、JSON、HTTPS API 或只读 SQLite 数据安全写入统一数据中心。"), h(antd.Typography.Title, { level: 4 }, "使用引导"), h("ol", null, h("li", null, "选择数据来源，第一次建议直接上传文件。"), h("li", null, "让系统读取并自动匹配字段。"), h("li", null, "核对字段并生成预览。"), h("li", null, "错误为 0 后确认写入。")), h(antd.Typography.Title, { level: 4 }, "安全说明"), h("p", null, "API 密钥只引用环境变量；数据库只读；失败保留 Trace；写入前必须人工确认。"), h(antd.Alert, { type: "warning", showIcon: true, message: "Excel 请使用统一数据中心的 Excel 导入功能。" })))
, 
        h(AgentDock, { open: agentOpen, onClose: function () { setAgentOpen(false); }, moduleLabel: "集成中心", chips: [{ key: "mapping", label: "字段映射检查" }, { key: "preview", label: "数据预览" }, { key: "sync", label: "集成同步状态" }], messages: agentMessages, draft: agentDraft, setDraft: setAgentDraft, busy: agentBusy, onSend: startAgentChat, onCommand: agentCommand })
          );
  }
  Q.registerRoutes("zhiyun-integration-hub", [{ path: "/apps/zhiyun-integration-hub", component: IntegrationHub, label: "系统集成中心", icon: "🔌", priority: 73 }]);
})();
