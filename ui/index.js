(function () {
  const root = document.getElementById("app") || document.body;
  root.innerHTML = `<main style="font-family:system-ui;max-width:1080px;margin:auto;padding:24px"><h1>Integration Hub</h1><p>连接文件、HTTPS API 与只读 SQLite，预览字段映射后再由用户确认写入 Data Core。</p><section id="health">正在检查依赖…</section><section style="display:grid;gap:10px;margin-top:20px"><label>连接器名称 <input id="name" value="订单导入"></label><label>类型 <select id="kind"><option value="file">CSV / JSON</option><option value="api">HTTPS API</option><option value="sqlite">只读 SQLite</option></select></label><label>配置 JSON（API: url/secret_env；SQLite: path/table）<textarea id="config" rows="3">{"filename":"orders.csv"}</textarea></label><label>文件 <input id="file" type="file" accept=".csv,.json"></label><label>Data Core 实体 <input id="entity" value="orders"></label><label>字段映射 JSON <textarea id="mapping" rows="4">{"order_no":"order_no","customer_name":"customer_name"}</textarea></label><div><button id="preview">读取并预览</button> <button id="commit" disabled>确认写入 Data Core</button></div><pre id="result" style="white-space:pre-wrap;background:#f5f5f5;padding:12px"></pre></section><section><h2>安全边界</h2><ul><li>凭据仅引用环境变量，不保存明文</li><li>外部连接默认只读</li><li>Data Core 写入必须确认并返回批次 ID</li><li>失败运行保留 Trace 和可重试错误</li></ul></section></main>`;
  let pending = null;
  const api = async (path, options) => { const response = await fetch(path, options); const body = await response.json(); if (!response.ok) throw new Error(body.detail || `HTTP ${response.status}`); return body; };
  const jsonBody = value => ({method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(value)});
  fetch('/api/zhiyun-integration-hub/health').then(r => r.json()).then(data => {
    document.getElementById('health').textContent = `版本 ${data.version} · ${data.status} · 支持 ${data.connector_types.join(' / ')}`;
  }).catch(error => { document.getElementById('health').textContent = `依赖健康检查失败：${error.message}；请检查 QwenPaw 日志。`; });
  document.getElementById('preview').onclick = async () => {
    const output = document.getElementById('result');
    try {
      const kind = document.getElementById('kind').value;
      const config = JSON.parse(document.getElementById('config').value);
      const connector = await api('/api/zhiyun-integration-hub/connectors', jsonBody({name:document.getElementById('name').value, kind, config}));
      let source;
      if (kind === 'file') {
        const form = new FormData(); const file = document.getElementById('file').files[0]; if (!file) throw new Error('请选择真实 CSV 或 JSON 文件'); form.append('file', file);
        source = await api('/api/zhiyun-integration-hub/files/parse', {method:'POST', body:form});
      } else source = await api('/api/zhiyun-integration-hub/sources/read', jsonBody({kind, config}));
      const hub = await api('/api/zhiyun-integration-hub/sync/preview', jsonBody({connector_id:connector.connector_id, entity:document.getElementById('entity').value, rows:source.rows, mapping:JSON.parse(document.getElementById('mapping').value)}));
      const request = hub.data_core_request;
      const dc = await api(`/api/zhiyun-data-core/imports/${encodeURIComponent(request.entity)}/preview`, jsonBody(request));
      pending = {hub, request, preview:dc}; document.getElementById('commit').disabled = dc.error_count !== 0;
      output.textContent = JSON.stringify({trace_id:hub.run.trace_id, data_core_preview:dc}, null, 2);
    } catch (error) { pending = null; document.getElementById('commit').disabled = true; output.textContent = `预览失败：${error.message}`; }
  };
  document.getElementById('commit').onclick = async () => {
    const output = document.getElementById('result'); if (!pending || !confirm('确认将预览记录写入 Data Core？')) return;
    try {
      const imported = await api(`/api/zhiyun-data-core/imports/${encodeURIComponent(pending.request.entity)}/commit`, jsonBody(pending.request));
      const run = await api(`/api/zhiyun-integration-hub/sync/${pending.hub.run.run_id}/commit`, jsonBody({output_count:imported.row_count, data_core_batch_id:imported.batch_id, confirmed:true}));
      output.textContent = JSON.stringify({message:'同步完成，可在 Data Core 按批次撤销', imported, run}, null, 2); document.getElementById('commit').disabled = true;
    } catch (error) { output.textContent = `提交失败：${error.message}；运行证据已保留，可修复后重试。`; }
  };
})();
