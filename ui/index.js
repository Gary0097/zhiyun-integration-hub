(function () {
  var Q = window.QwenPaw;
  if (!Q || !Q.host || !Q.host.React || !Q.registerRoutes) return;
  var React = Q.host.React, antd = Q.host.antd, h = React.createElement;

  function request(path, options) {
    return Q.host.fetch(path, options).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (body) {
        if (!response.ok) throw new Error(body.detail || ("HTTP " + response.status));
        return body;
      });
    });
  }

  function IntegrationHub() {
    var healthState = React.useState(null), health = healthState[0], setHealth = healthState[1];
    var resultState = React.useState(null), result = resultState[0], setResult = resultState[1];
    var pendingState = React.useState(null), pending = pendingState[0], setPending = pendingState[1];
    var loadingState = React.useState(false), loading = loadingState[0], setLoading = loadingState[1];
    var form = antd.Form.useForm()[0], message = antd.App.useApp().message;
    React.useEffect(function () { request("/zhiyun-integration-hub/health").then(setHealth).catch(function (error) { setHealth({ status: "degraded", reason: error.message }); }); }, []);
    function json(value) { return { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) }; }

    function preview() {
      form.validateFields().then(function (values) {
        setLoading(true); setResult(null); setPending(null);
        var config = JSON.parse(values.config), mapping = JSON.parse(values.mapping);
        return request("/zhiyun-integration-hub/connectors", json({ name: values.name, kind: values.kind, config: config }))
          .then(function (connector) {
            if (values.kind === "file") {
              var file = values.file && values.file.fileList && values.file.fileList[0] && values.file.fileList[0].originFileObj;
              if (!file) throw new Error("请选择真实 CSV 或 JSON 文件");
              var data = new FormData(); data.append("file", file);
              return request("/zhiyun-integration-hub/files/parse", { method: "POST", body: data }).then(function (source) { return { connector: connector, source: source }; });
            }
            return request("/zhiyun-integration-hub/sources/read", json({ kind: values.kind, config: config })).then(function (source) { return { connector: connector, source: source }; });
          }).then(function (context) {
            return request("/zhiyun-integration-hub/sync/preview", json({ connector_id: context.connector.connector_id, entity: values.entity, rows: context.source.rows, mapping: mapping }));
          }).then(function (hub) {
            var dataCore = hub.data_core_request;
            return request("/zhiyun-data-core/imports/" + encodeURIComponent(dataCore.entity) + "/preview", json(dataCore)).then(function (checked) {
              setPending({ hub: hub, request: dataCore, preview: checked }); setResult({ trace_id: hub.run.trace_id, data_core_preview: checked });
            });
          });
      }).catch(function (error) { message.error(error.message || "预览失败"); }).finally(function () { setLoading(false); });
    }

    function commit() {
      if (!pending) return;
      antd.Modal.confirm({ title: "确认写入 Data Core？", content: "将写入 " + pending.preview.valid_count + " 条真实记录，并生成可撤销批次。", okText: "确认写入", onOk: function () {
        setLoading(true);
        return request("/zhiyun-data-core/imports/" + encodeURIComponent(pending.request.entity) + "/commit", json(pending.request)).then(function (imported) {
          return request("/zhiyun-integration-hub/sync/" + pending.hub.run.run_id + "/commit", json({ output_count: imported.row_count, data_core_batch_id: imported.batch_id, confirmed: true })).then(function (run) {
            setResult({ message: "同步完成，可在 Data Core 按批次撤销", imported: imported, run: run }); setPending(null);
          });
        }).catch(function (error) { message.error(error.message || "提交失败，运行证据已保留，可修复后重试"); }).finally(function () { setLoading(false); });
      } });
    }

    return h("div", { style: { padding: 28, height: "100%", overflow: "auto", background: "#f7f8fa" } }, h("div", { style: { maxWidth: 1080, margin: "0 auto" } },
      h("h2", null, "Integration Hub"), h("p", { style: { color: "#667085" } }, "连接文件、HTTPS API 与只读 SQLite，预览字段映射后再由用户确认写入 Data Core。"),
      h(antd.Alert, { type: health && health.status === "available" ? "success" : "warning", showIcon: true, message: health ? ("版本 " + (health.version || "未知") + " · " + health.status) : "正在检查依赖", description: health && health.reason ? health.reason : "凭据仅引用环境变量；外部连接默认只读；写入必须确认并返回批次 ID。", style: { marginBottom: 16 } }),
      h(antd.Card, { title: "创建同步预览", style: { marginBottom: 16 } }, h(antd.Form, { form: form, layout: "vertical", initialValues: { name: "订单导入", kind: "file", config: '{"filename":"orders.csv"}', entity: "orders", mapping: '{"order_no":"order_no","customer_name":"customer_name"}' } },
        h(antd.Row, { gutter: 12 }, h(antd.Col, { span: 12 }, h(antd.Form.Item, { name: "name", label: "连接器名称", rules: [{ required: true }] }, h(antd.Input))), h(antd.Col, { span: 12 }, h(antd.Form.Item, { name: "kind", label: "类型" }, h(antd.Select, { options: [{ value: "file", label: "CSV / JSON" }, { value: "api", label: "HTTPS API" }, { value: "sqlite", label: "只读 SQLite" }] })))),
        h(antd.Form.Item, { name: "config", label: "配置 JSON（API: url/secret_env；SQLite: path/table）", rules: [{ required: true }] }, h(antd.Input.TextArea, { rows: 3 })),
        h(antd.Form.Item, { name: "file", label: "文件" }, h(antd.Upload, { accept: ".csv,.json", beforeUpload: function () { return false; }, maxCount: 1 }, h(antd.Button, null, "选择 CSV / JSON"))),
        h(antd.Form.Item, { name: "entity", label: "Data Core 实体", rules: [{ required: true, pattern: /^[a-z][a-z0-9_]{0,63}$/ }] }, h(antd.Input)),
        h(antd.Form.Item, { name: "mapping", label: "字段映射 JSON", rules: [{ required: true }] }, h(antd.Input.TextArea, { rows: 4 })),
        h(antd.Space, null, h(antd.Button, { type: "primary", loading: loading, onClick: preview }, "读取并预览"), h(antd.Button, { disabled: !pending || pending.preview.error_count > 0, onClick: commit }, "确认写入 Data Core")))),
      result ? h(antd.Card, { title: "同步证据" }, h("pre", { style: { whiteSpace: "pre-wrap", overflowWrap: "anywhere" } }, JSON.stringify(result, null, 2))) : null));
  }

  Q.registerRoutes("zhiyun-integration-hub", [{ path: "/apps/zhiyun-integration-hub", component: IntegrationHub, label: "Integration Hub", icon: "🔌", priority: 73 }]);
})();
