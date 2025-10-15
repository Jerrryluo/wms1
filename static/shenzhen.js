// 深圳仓模块：包含深圳库存、记录、调拨与入库操作

function openShenzhenModal(productId, productName) {
    const modal = document.getElementById('shenzhen-modal');
    if (!modal) {
        alert('未找到深圳仓管理弹窗');
        return;
    }
    modal.style.display = 'block';
    modal.dataset.productId = productId;
    modal.dataset.productName = productName || '';
    const titleEl = document.getElementById('shenzhen-modal-title');
    if (titleEl) {
        titleEl.textContent = `深圳仓管理 - ${productName}（${productId}）`;
    }

    loadShenzhenStock(productId);
    loadShenzhenRecords(productId);
}

function closeShenzhenModal() {
    const modal = document.getElementById('shenzhen-modal');
    if (modal) modal.style.display = 'none';
}

function submitShenzhenInbound() {
    const modal = document.getElementById('shenzhen-modal');
    if (!modal) return;
    const productId = modal.dataset.productId;
    const box_spec = document.getElementById('sz-incoming-box-spec').value.trim();
    const quantity = parseInt(document.getElementById('sz-incoming-quantity').value, 10);
    const expiry_date = document.getElementById('sz-incoming-expiry-date').value;
    const batch_number = document.getElementById('sz-incoming-batch-number').value.trim();

    if (!box_spec || !quantity || !expiry_date || !batch_number) {
        alert('请填写完整的深圳入库信息');
        return;
    }

    apiRequest('/api/shenzhen/incoming', 'POST', {
        product_id: productId,
        box_spec,
        quantity,
        batch_number,
        expiry_date
    })
    .then(() => {
        alert('深圳入库成功');
        document.getElementById('sz-incoming-box-spec').value = '';
        document.getElementById('sz-incoming-quantity').value = '';
        document.getElementById('sz-incoming-expiry-date').value = '';
        document.getElementById('sz-incoming-batch-number').value = '';
        loadShenzhenStock(productId);
        loadShenzhenRecords(productId);
        displayStockList();
    })
    .catch(err => handleApiError(err, '深圳入库'));
}

function loadShenzhenStock(productId) {
    apiRequest(`/api/shenzhen/stock?product_id=${productId}`)
        .then(stock => {
            const szBody = document.getElementById('sz-stock-body');
            if (!szBody) return;
            szBody.innerHTML = '';

            const shenzhenItems = stock;
            if (shenzhenItems.length === 0) {
                const tr = document.createElement('tr');
                tr.innerHTML = '<td colspan="5">暂无深圳库存记录</td>';
                szBody.appendChild(tr);
                return;
            }

            shenzhenItems.forEach(s => {
                const tr = document.createElement('tr');
                const safeExpiry = s.expiry_date || '';
                const safeBatch = s.batch_number || '';
                const safeSpec = s.box_spec || '';
                const availableQty = s.quantity || 0;
                tr.innerHTML = `
                    <td>${safeSpec || '-'}</td>
                    <td>${availableQty}</td>
                    <td>${safeBatch || '-'}</td>
                    <td>${safeExpiry ? new Date(s.expiry_date).toLocaleDateString() : '-'}</td>
                    <td>
                        <input type="number" min="1" max="${availableQty}" value="${availableQty}" id="sz-transfer-qty-${s.id}" style="width:80px;" ${availableQty === 0 ? 'disabled' : ''}>
                        <button class="small-button" ${availableQty === 0 ? 'disabled' : ''} onclick="openShenzhenTransferConfirm('${s.id}', '${safeSpec}', '${safeBatch}', '${safeExpiry}', ${availableQty})">调拨</button>
                    </td>
                `;
                szBody.appendChild(tr);
            });
        })
        .catch(err => handleApiError(err, '加载深圳库存'));
}

function loadShenzhenRecords(productId) {
    apiRequest(`/api/shenzhen/records?product_id=${productId}`)
        .then(records => {
            const body = document.getElementById('sz-records-body');
            if (!body) return;
            body.innerHTML = '';
            const filtered = records;
            if (filtered.length === 0) {
                const tr = document.createElement('tr');
                tr.innerHTML = '<td colspan="7">暂无深圳出入库记录</td>';
                body.appendChild(tr);
                return;
            }
            filtered.forEach(r => {
                const opDisplay = (r.operation_type === '出库' && /调拨/.test(r.reason || '')) ? '调拨' : r.operation_type;
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${r.date || '-'}</td>
                    <td>${opDisplay}</td>
                    <td>${r.box_spec || '-'}</td>
                    <td>${r.quantity || 0}</td>
                    <td>${r.batch_number || '-'}</td>
                    <td>${r.expiry_date || '-'}</td>
                    <td>${r.operator || '-'}</td>
                `;
                body.appendChild(tr);
            });
        })
        .catch(err => handleApiError(err, '加载深圳出入库记录'));
}

function transferFromShenzhen(stockId, box_spec, batch_number, expiry_date, quantity, destLocationParam, transferQtyParam) {
    const modal = document.getElementById('shenzhen-modal');
    if (!modal) return;
    const productId = modal.dataset.productId;
    const qtyInput = document.getElementById(`sz-transfer-qty-${stockId}`);
    let transferQty = transferQtyParam ? parseInt(transferQtyParam, 10) : parseInt(qtyInput ? qtyInput.value : quantity, 10);
    if (!transferQty || isNaN(transferQty) || transferQty <= 0) {
        alert('请输入有效的调拨数量');
        return;
    }
    if (transferQty > quantity) {
        transferQty = quantity;
        if (qtyInput) qtyInput.value = quantity;
    }

    const destSelect = document.getElementById('sz-dest-location');
    const destLocation = destLocationParam || (destSelect ? destSelect.value : '');
    if (!destLocation) {
        alert('请选择目的库位');
        return;
    }
    if (destLocation === 'Shenzhen') {
        alert('目的库位不能为深圳');
        return;
    }

    apiRequest('/api/shenzhen/outgoing', 'POST', {
        product_id: productId,
        box_spec: box_spec,
        quantity: transferQty,
        outgoing_reason: '深圳调拨到香港',
        batch_number: (batch_number && batch_number !== '-') ? batch_number : null,
        expiry_date: (expiry_date && expiry_date !== '-') ? expiry_date : null,
        location: 'Shenzhen'
    })
    .then(() => {
        return apiRequest('/api/incoming', 'POST', {
            product_id: productId,
            box_spec: box_spec,
            quantity: transferQty,
            batch_number: (batch_number && batch_number !== '-') ? batch_number : '',
            incoming_reason: '采购',
            expiry_date: (expiry_date || new Date().toISOString().slice(0,10)),
            location: destLocation
        });
    })
    .then(() => {
        alert('调拨成功：深圳出库并入库至香港');
        loadShenzhenStock(productId);
        loadShenzhenRecords(productId);
        displayStockList();
        closeShenzhenTransferConfirm();
    })
    .catch(err => handleApiError(err, '调拨'));
}

function openShenzhenTransferConfirm(stockId, box_spec, batch_number, expiry_date, availableQty) {
    const modal = document.getElementById('shenzhen-modal');
    if (!modal) return;
    const productId = modal.dataset.productId;
    const productName = modal.dataset.productName || productId;

    const qtyInput = document.getElementById(`sz-transfer-qty-${stockId}`);
    let transferQty = parseInt(qtyInput ? qtyInput.value : availableQty, 10);
    if (!transferQty || isNaN(transferQty) || transferQty <= 0) {
        alert('请输入有效的调拨数量');
        return;
    }
    if (transferQty > availableQty) {
        transferQty = availableQty;
        if (qtyInput) qtyInput.value = availableQty;
    }

    const destSelect = document.getElementById('sz-dest-location');
    const destLocation = destSelect ? destSelect.value : '';
    if (!destLocation) {
        alert('请选择目的库位');
        return;
    }
    if (destLocation === 'Shenzhen') {
        alert('目的库位不能为深圳');
        return;
    }

    const confirmModal = document.getElementById('shenzhen-transfer-confirm-modal');
    if (!confirmModal) {
        alert('未找到确认调拨弹窗');
        return;
    }
    document.getElementById('sz-confirm-product').textContent = `${productName}（${productId}）`;
    document.getElementById('sz-confirm-spec').textContent = box_spec || '-';
    document.getElementById('sz-confirm-qty').textContent = transferQty;
    document.getElementById('sz-confirm-location').textContent = destLocation;

    confirmModal.dataset.stockId = stockId;
    confirmModal.dataset.boxSpec = box_spec || '';
    confirmModal.dataset.batchNumber = (batch_number && batch_number !== '-') ? batch_number : '';
    confirmModal.dataset.expiryDate = (expiry_date && expiry_date !== '-') ? expiry_date : '';
    confirmModal.dataset.transferQty = transferQty;
    confirmModal.dataset.destLocation = destLocation;

    confirmModal.style.display = 'block';
}

function closeShenzhenTransferConfirm() {
    const confirmModal = document.getElementById('shenzhen-transfer-confirm-modal');
    if (confirmModal) confirmModal.style.display = 'none';
}

function confirmTransferFromShenzhen() {
    const confirmModal = document.getElementById('shenzhen-transfer-confirm-modal');
    if (!confirmModal) return;
    const stockId = confirmModal.dataset.stockId;
    const box_spec = confirmModal.dataset.boxSpec;
    const batch_number = confirmModal.dataset.batchNumber;
    const expiry_date = confirmModal.dataset.expiryDate;
    const transferQty = parseInt(confirmModal.dataset.transferQty, 10);
    const destLocation = confirmModal.dataset.destLocation;

    transferFromShenzhen(stockId, box_spec, batch_number, expiry_date, transferQty, destLocation, transferQty);
}