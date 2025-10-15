// Records filters, list, export, and edit modal
function populateRecordFilters() {
    const productFilter = document.getElementById('record-product-filter');
    if (productFilter) {
        productFilter.innerHTML = '<option value="">全部产品</option>';
        apiRequest('/api/products')
            .then(products => {
                products.forEach(product => {
                    const option = document.createElement('option');
                    option.value = product.id;
                    option.textContent = product.name;
                    productFilter.appendChild(option);
                });
            })
            .catch(error => { console.error('加载产品列表失败:', error); });
    }

    const locationFilter = document.getElementById('record-location-filter');
    if (locationFilter) {
        locationFilter.innerHTML = '<option value="">全部库位</option>';
        apiRequest('/api/stock')
            .then(stocks => {
                const locations = [...new Set(stocks.map(stock => stock.location).filter(Boolean))];
                locations.sort((a, b) => {
                    const letterA = a.match(/[A-Za-z]+/)?.[0] || '';
                    const letterB = b.match(/[A-Za-z]+/)?.[0] || '';
                    if (letterA !== letterB) return letterA.localeCompare(letterB);
                    const numA = parseInt(a.match(/\d+/)?.[0] || '0', 10);
                    const numB = parseInt(b.match(/\d+/)?.[0] || '0', 10);
                    return numA - numB;
                });
                locations.forEach(location => {
                    const option = document.createElement('option');
                    option.value = location;
                    option.textContent = location;
                    locationFilter.appendChild(option);
                });
            })
            .catch(error => { console.error('加载库位列表失败:', error); alert('加载库位列表失败'); });
    }

    const operatorFilter = document.getElementById('record-operator-filter');
    if (operatorFilter) {
        operatorFilter.innerHTML = '<option value="">全部操作人</option>';
        apiRequest('/api/records')
            .then(records => {
                if (!Array.isArray(records)) { console.error('返回的records不是数组:', records); return; }
                const operators = [...new Set(records.map(record => record.operator).filter(Boolean))];
                operators.forEach(operator => {
                    const option = document.createElement('option');
                    option.value = operator;
                    option.textContent = operator;
                    operatorFilter.appendChild(option);
                });
            })
            .catch(error => { console.error('加载操作人列表失败:', error); });
    }

    const reasonFilter = document.getElementById('record-reason-filter');
    if (reasonFilter) {
        reasonFilter.innerHTML = '<option value="">全部原因</option>';
        apiRequest('/api/records')
            .then(records => {
                if (!Array.isArray(records)) { console.error('返回的records不是数组:', records); return; }
                const reasons = [...new Set(records.map(record => record.reason).filter(Boolean))];
                reasons.forEach(reason => {
                    const option = document.createElement('option');
                    option.value = reason;
                    option.textContent = reason;
                    reasonFilter.appendChild(option);
                });
            })
            .catch(error => { console.error('加载操作原因列表失败:', error); });
    }
}

function displayRecords() {
    const productFilterEl = document.getElementById('record-product-filter');
    const operationFilterEl = document.getElementById('record-operation-filter');
    const locationFilterEl = document.getElementById('record-location-filter');
    const startDateFilterEl = document.getElementById('record-start-date-filter');
    const endDateFilterEl = document.getElementById('record-end-date-filter');
    const reasonFilterEl = document.getElementById('record-reason-filter');
    const operatorFilterEl = document.getElementById('record-operator-filter');
    if (!productFilterEl || !operationFilterEl || !locationFilterEl || !startDateFilterEl || !endDateFilterEl || !reasonFilterEl || !operatorFilterEl) {
        console.debug('记录筛选元素不存在');
        return;
    }

    const productFilter = productFilterEl.value;
    const operationFilter = operationFilterEl.value;
    const locationFilter = locationFilterEl.value;
    const startDateFilter = startDateFilterEl.value;
    const endDateFilter = endDateFilterEl.value;
    const reasonFilter = reasonFilterEl.value;
    const operatorFilter = operatorFilterEl.value;

    let defaultStartDate = null;
    if (!startDateFilter && !endDateFilter) {
        defaultStartDate = new Date();
        defaultStartDate.setDate(defaultStartDate.getDate() - 30);
        defaultStartDate.setHours(0, 0, 0, 0);
    }

    apiRequest('/api/records')
        .then(records => {
            const filteredRecords = records.filter(record => {
                const matchProduct = !productFilter || record.product_id === productFilter;
                const matchOperation = !operationFilter || record.operation_type === operationFilter;
                const matchLocation = !locationFilter || record.location === locationFilter;
                const recordDate = new Date(record.date); recordDate.setHours(0, 0, 0, 0);
                let matchDate = true;
                if (startDateFilter) { const startDate = new Date(startDateFilter); startDate.setHours(0, 0, 0, 0); matchDate = matchDate && recordDate >= startDate; }
                else if (defaultStartDate) { matchDate = matchDate && recordDate >= defaultStartDate; }
                if (endDateFilter) { const endDate = new Date(endDateFilter); endDate.setHours(0, 0, 0, 0); matchDate = matchDate && recordDate <= endDate; }
                const matchReason = !reasonFilter || record.reason === reasonFilter;
                const matchOperator = !operatorFilter || record.operator === operatorFilter;
                return matchProduct && matchOperation && matchLocation && matchDate && matchReason && matchOperator;
            });

            const recordListBody = document.getElementById('record-list-body');
            if (!recordListBody) return;
            recordListBody.innerHTML = '';
            filteredRecords.forEach(record => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${convertToBeijingTime(record.date)}</td>
                    <td>${record.product_name}</td>
                    <td>${record.operation_type}</td>
                    <td>${record.location || '-'}</td>
                    <td>${record.quantity}</td>
                    <td>${record.box_spec || '-'}</td>
                    <td>${record.total || 0}</td>
                    <td>${record.batch_number || '-'}</td>
                    <td>${record.expiry_date ? new Date(record.expiry_date).toLocaleDateString() : '-'}</td>
                    <td>${record.reason || '-'}</td>
                    <td>${record.operator || '未知'}</td>
                    <td><button class="small-button" onclick="openEditRecordModal('${record.id}')">修改</button></td>
                `;
                recordListBody.appendChild(row);
            });
        })
        .catch(error => {
            console.error('加载记录失败:', error);
            const recordListBody = document.getElementById('record-list-body');
            if (recordListBody) {
                const tr = document.createElement('tr');
                const td = document.createElement('td');
                td.colSpan = 12; td.textContent = '加载记录失败'; tr.appendChild(td);
                recordListBody.innerHTML = ''; recordListBody.appendChild(tr);
            }
        });
}

function showProductRecords(productId, productName) {
    apiRequest(`/api/records?product_id=${productId}`)
        .then(records => {
            records = records.filter(record => record.product_id === productId);
            const modal = document.createElement('div');
            modal.style.position = 'fixed'; modal.style.top = '0'; modal.style.left = '0';
            modal.style.width = '100%'; modal.style.height = '100%';
            modal.style.backgroundColor = 'rgba(0,0,0,0.5)'; modal.style.display = 'flex';
            modal.style.justifyContent = 'center'; modal.style.alignItems = 'center'; modal.style.zIndex = '1000';
            const modalContent = document.createElement('div');
            modalContent.style.backgroundColor = 'white'; modalContent.style.padding = '20px'; modalContent.style.borderRadius = '8px';
            modalContent.style.maxWidth = '80%'; modalContent.style.maxHeight = '80%'; modalContent.style.overflow = 'auto';
            const closeBtn = document.createElement('button'); closeBtn.textContent = '关闭'; closeBtn.style.position = 'absolute'; closeBtn.style.top = '10px'; closeBtn.style.right = '10px'; closeBtn.onclick = () => document.body.removeChild(modal);
            const table = document.createElement('table'); table.style.width = '100%'; table.style.borderCollapse = 'collapse';
            const thead = document.createElement('thead'); thead.innerHTML = `
                <tr><th>日期</th><th>操作类型</th><th>数量</th><th>规格</th><th>批次号</th><th>库位</th><th>原因</th></tr>`;
            const tbody = document.createElement('tbody');
            records.forEach(record => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${new Date(record.date).toLocaleDateString()}</td>
                    <td>${record.operation_type === 'incoming' ? '入库' : (record.operation_type === 'outgoing' ? '出库' : record.operation_type || '未知')}</td>
                    <td>${record.quantity}</td>
                    <td>${record.box_spec}</td>
                    <td>${record.batch_number}</td>
                    <td>${record.location}</td>
                    <td>${record.reason}</td>`;
                tbody.appendChild(tr);
            });
            table.appendChild(thead); table.appendChild(tbody); modalContent.appendChild(table); modalContent.appendChild(closeBtn);
            modal.appendChild(modalContent); document.body.appendChild(modal);
        })
        .catch(error => { console.error('获取记录失败:', error); alert('获取记录失败'); });
}

function exportRecordsToExcel() {
    const productFilterEl = document.getElementById('record-product-filter');
    const operationFilterEl = document.getElementById('record-operation-filter');
    const locationFilterEl = document.getElementById('record-location-filter');
    const startDateFilterEl = document.getElementById('record-start-date-filter');
    const endDateFilterEl = document.getElementById('record-end-date-filter');
    const reasonFilterEl = document.getElementById('record-reason-filter');
    const operatorFilterEl = document.getElementById('record-operator-filter');
    if (!productFilterEl || !operationFilterEl || !locationFilterEl || !startDateFilterEl || !endDateFilterEl || !reasonFilterEl || !operatorFilterEl) {
        console.error('记录筛选元素不存在，无法导出');
        return;
    }
    const productFilter = productFilterEl.value;
    const operationFilter = operationFilterEl.value;
    const locationFilter = locationFilterEl.value;
    const startDateFilter = startDateFilterEl.value;
    const endDateFilter = endDateFilterEl.value;
    const reasonFilter = reasonFilterEl.value;
    const operatorFilter = operatorFilterEl.value;

    let defaultStartDate = null;
    if (!startDateFilter && !endDateFilter) {
        defaultStartDate = new Date(); defaultStartDate.setDate(defaultStartDate.getDate() - 30); defaultStartDate.setHours(0, 0, 0, 0);
    }

    apiRequest('/api/records')
        .then(records => {
            const filteredRecords = records.filter(record => {
                const matchProduct = !productFilter || record.product_id === productFilter;
                const matchOperation = !operationFilter || record.operation_type === operationFilter;
                const matchLocation = !locationFilter || record.location === locationFilter;
                const recordDate = new Date(record.date); recordDate.setHours(0, 0, 0, 0);
                let matchDate = true;
                if (startDateFilter) { const startDate = new Date(startDateFilter); startDate.setHours(0, 0, 0, 0); matchDate = matchDate && recordDate >= startDate; }
                else if (defaultStartDate) { matchDate = matchDate && recordDate >= defaultStartDate; }
                if (endDateFilter) { const endDate = new Date(endDateFilter); endDate.setHours(0, 0, 0, 0); matchDate = matchDate && recordDate <= endDate; }
                const matchReason = !reasonFilter || record.reason === reasonFilter;
                const matchOperator = !operatorFilter || record.operator === operatorFilter;
                return matchProduct && matchOperation && matchLocation && matchDate && matchReason && matchOperator;
            });

            const headers = ['日期', '品名', '操作类型', '库位', '数量', '规格', '总数', '批次号', '过期日期', '操作原因', '操作人'];
            const wsData = [ headers, ...filteredRecords.map(record => [
                record.date,
                record.product_name,
                record.operation_type,
                record.location,
                record.quantity,
                record.box_spec,
                record.total || 0,
                record.batch_number || '-',
                record.expiry_date ? new Date(record.expiry_date).toLocaleDateString() : '-',
                record.reason || '-',
                record.operator || '未知'
            ]) ];

            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.aoa_to_sheet(wsData);
            XLSX.utils.book_append_sheet(wb, ws, '出入库记录');
            XLSX.writeFile(wb, `出入库记录_${new Date().toISOString().slice(0, 10)}.xlsx`);
        })
        .catch(error => { console.error('导出记录失败:', error); alert('导出记录失败'); });
}

function resetRecordFilters() {
    const productFilter = document.getElementById('record-product-filter');
    const operationFilter = document.getElementById('record-operation-filter');
    const locationFilter = document.getElementById('record-location-filter');
    const startDateFilter = document.getElementById('record-start-date-filter');
    const endDateFilter = document.getElementById('record-end-date-filter');
    const reasonFilter = document.getElementById('record-reason-filter');
    const operatorFilter = document.getElementById('record-operator-filter');
    if (productFilter) productFilter.value = '';
    if (operationFilter) operationFilter.value = '';
    if (locationFilter) locationFilter.value = '';
    if (startDateFilter) startDateFilter.value = '';
    if (endDateFilter) endDateFilter.value = '';
    if (reasonFilter) reasonFilter.value = '';
    if (operatorFilter) operatorFilter.value = '';
    displayRecords();
}

function openEditRecordModal(recordId) {
    getCurrentUser().then(user => {
        if (!user || !user.is_admin) { alert('只有管理员可以修改记录'); return; }
        apiRequest('/api/records')
            .then(records => {
                const record = records.find(r => String(r.id) === String(recordId));
                if (record) {
                    const editRecordId = document.getElementById('edit-record-id');
                    const editRecordProduct = document.getElementById('edit-record-product');
                    const editRecordOperation = document.getElementById('edit-record-operation');
                    const editRecordQuantity = document.getElementById('edit-record-quantity');
                    const editRecordBoxSpec = document.getElementById('edit-record-box-spec');
                    const editRecordReason = document.getElementById('edit-record-reason');
                    const editRecordBatchNumber = document.getElementById('edit-record-batch-number');
                    const editRecordExpiryDate = document.getElementById('edit-record-expiry-date');
                    const editRecordModal = document.getElementById('edit-record-modal');
                    if (editRecordId) editRecordId.value = record.id;
                    if (editRecordProduct) editRecordProduct.value = record.product_name;
                    if (editRecordOperation) editRecordOperation.value = record.operation_type;
                    if (editRecordQuantity) editRecordQuantity.value = record.quantity;
                    if (editRecordBoxSpec) editRecordBoxSpec.value = record.box_spec || '';
                    if (editRecordReason) editRecordReason.value = record.reason || '';
                    if (editRecordBatchNumber) editRecordBatchNumber.value = record.batch_number || '';
                    if (editRecordExpiryDate) {
                        if (record.expiry_date) {
                            const expiryDate = new Date(record.expiry_date);
                            const formattedDate = expiryDate.toISOString().split('T')[0];
                            editRecordExpiryDate.value = formattedDate;
                        } else { editRecordExpiryDate.value = ''; }
                    }
                    if (editRecordModal) editRecordModal.style.display = 'block';
                } else { alert('找不到记录'); }
            })
            .catch(error => { console.error('获取记录失败:', error); alert('获取记录失败: ' + error); });
    });
}

function updateRecord() {
    const recordIdElement = document.getElementById('edit-record-id');
    const quantityElement = document.getElementById('edit-record-quantity');
    const boxSpecElement = document.getElementById('edit-record-box-spec');
    const reasonElement = document.getElementById('edit-record-reason');
    const batchNumberElement = document.getElementById('edit-record-batch-number');
    const expiryDateElement = document.getElementById('edit-record-expiry-date');
    if (!recordIdElement || !quantityElement || !boxSpecElement || !reasonElement || !batchNumberElement || !expiryDateElement) {
        console.error('Required elements not found for record update');
        return;
    }
    const recordId = recordIdElement.value;
    const quantity = parseInt(quantityElement.value);
    const boxSpec = boxSpecElement.value;
    const reason = reasonElement.value;
    const batchNumber = batchNumberElement.value;
    const expiryDate = expiryDateElement.value;
    if (isNaN(quantity) || quantity <= 0) { alert('请输入有效的数量'); return; }
    if (!boxSpec.trim()) { alert('请输入有效的规格'); return; }
    if (!reason.trim()) { alert('请输入原因'); return; }
    apiRequest('/api/records/update', 'POST', { record_id: recordId, quantity, box_spec: boxSpec, reason, batch_number: batchNumber, expiry_date: expiryDate })
        .then(response => {
            if (response.success) {
                alert('记录修改成功');
                const modalEl = document.getElementById('edit-record-modal');
                if (modalEl) modalEl.style.display = 'none';
                displayRecords();
            } else { alert(response.message || '修改失败'); }
        })
        .catch(error => { console.error('修改记录失败:', error); alert('修改记录失败: ' + error); });
}

// 删除记录并同步刷新列表与库存
function deleteRecord() {
    const recordIdElement = document.getElementById('edit-record-id');
    const modalEl = document.getElementById('edit-record-modal');
    if (!recordIdElement) {
        console.error('Required element not found for record deletion');
        return;
    }
    const recordId = recordIdElement.value;
    if (!recordId) { alert('记录ID缺失，无法删除'); return; }
    if (!confirm('确认删除该记录？此操作不可恢复，并会同步影响库存。')) return;

    apiRequest(`/api/records/${recordId}`, 'DELETE')
        .then(response => {
            if (response.success) {
                alert('记录已删除');
                if (modalEl) modalEl.style.display = 'none';
                // 重新加载记录与库存
                if (typeof displayRecords === 'function') displayRecords();
                if (typeof displayStockList === 'function') displayStockList();
            } else {
                alert(response.message || '删除失败');
            }
        })
        .catch(error => { console.error('删除记录失败:', error); alert('删除记录失败: ' + error.message); });
}