function pageInit() {
  // 兼容：如果存在商户加载函数则先加载，否则直接拉取仪表盘
  try {
    if (typeof getCurrentMerchant === 'function') {
      // 无论成功失败都继续加载仪表盘，避免页面卡住
      Promise.resolve(getCurrentMerchant()).finally(() => loadDashboard());
    } else {
      loadDashboard();
    }
  } catch (e) {
    console.warn('getCurrentMerchant 未可用，直接加载仪表盘');
    loadDashboard();
  }
}

function loadDashboard() {
  apiRequest('/api/dashboard', 'GET')
    .then(data => renderDashboard(data))
    .catch(err => handleApiError(err, '加载仪表盘'));
}

function renderDashboard(data) {
  try {
    // 新库存概览（三部分）
    const alerts = data?.alerts || {};
    const sup90 = alerts?.supplement_stockout_90 || [];
    const pack35 = alerts?.packaging_stockout_35 || [];
    const exp360 = alerts?.supplement_expiry_360 || [];

    renderList('inv-supplement-stockout-90', sup90.map(p => {
      const days = p.days_to_stockout != null ? `${p.days_to_stockout} 天` : '未知';
      return `${p.name}（剩余 ${formatNumber(p.items)} 件，预计断货 ${days}）`;
    }));

    renderList('inv-packaging-stockout-35', pack35.map(p => {
      const days = p.days_to_stockout != null ? `${p.days_to_stockout} 天` : '未知';
      return `${p.name}（剩余 ${formatNumber(p.items)} 件，预计断货 ${days}）`;
    }));

    renderList('inv-supplement-expiry-360', exp360.map(i => {
      const days = i.days_to_expiry != null ? `${i.days_to_expiry} 天` : '未知';
      const expiry = i.expiry_date || '无';
      return `${i.name}（过期日期 ${expiry}，剩余 ${formatNumber(i.items)} 件，预计到期 ${days}）`;
    }));

    // 入库/出库概览
    setText('in-today', formatNumber(data?.flow?.incoming?.today));
    setText('in-week', formatNumber(data?.flow?.incoming?.week));
    setText('in-month', formatNumber(data?.flow?.incoming?.month));
    setText('out-today', formatNumber(data?.flow?.outgoing?.today));
    setText('out-week', formatNumber(data?.flow?.outgoing?.week));
    setText('out-month', formatNumber(data?.flow?.outgoing?.month));

    // 产品表现
    renderList('perf-best', (data?.performance?.best_sellers || []).map(p => `${p.name}：${formatNumber(p.outgoing_boxes)} 箱`));
    renderList('perf-slow', (data?.performance?.slow_movers || []).map(p => `${p.name}：${formatNumber(p.outgoing_boxes)} 箱`));

    // 库位利用率
    const total = data?.location?.total_locations || 0;
    const occ = data?.location?.occupied_locations || 0;
    setText('loc-total', formatNumber(total));
    setText('loc-occupied', formatNumber(occ));
    const rate = total ? ((occ / total) * 100).toFixed(1) + '%' : '-';
    setText('loc-rate', rate);

    // 深圳待调拨
    // 深圳待调拨：改为统计箱数，兼容旧字段回退
    setText('sz-pending-boxes', formatNumber((data?.shenzhen?.pending_boxes ?? data?.shenzhen?.pending_items)));
    setText('sz-avg-days', data?.shenzhen?.avg_retention_days != null ? data.shenzhen.avg_retention_days.toFixed(1) : '-');
    renderList('sz-items', (data?.shenzhen?.items || []).map(i => {
      const days = i.days_since_inbound != null ? `${i.days_since_inbound} 天` : '未知';
      return `${i.name}：${formatNumber(i.items)} 件（${i.boxes} 箱），滞留 ${days}`;
    }));
  } catch (e) {
    console.error('渲染仪表盘失败', e);
  }
}

function renderList(id, items) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = '';
  if (!items || !items.length) {
    el.innerHTML = '<li>暂无数据</li>';
    return;
  }
  items.forEach(text => {
    const li = document.createElement('li');
    li.textContent = text;
    el.appendChild(li);
  });
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text != null ? text : '-';
}

function formatNumber(n) {
  if (n == null) return '-';
  if (typeof n === 'number') return n.toLocaleString();
  const x = Number(n);
  return isNaN(x) ? '-' : x.toLocaleString();
}