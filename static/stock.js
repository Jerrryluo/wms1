// 库存模块：拆分自 script.js，负责库存列表、排序、风险、导出等

let includeShenzhenStock = true;

function toggleStockoutCalculation() {
    includeShenzhenStock = !includeShenzhenStock;
    const button = document.getElementById('toggle-stockout-calculation');
    if (button) {
        button.textContent = `切换断货风险计算（当前：${includeShenzhenStock ? '深圳+香港' : '仅香港'}）`;
    }
    displayStockList();
}

let currentSortField = 'product_id';
let currentSortDirection = 'asc';

function sortStockList(field) {
    if (field === currentSortField) {
        currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        currentSortField = field;
        currentSortDirection = 'asc';
    }
    updateSortIndicators();
    displayStockList();
}

function updateSortIndicators() {
    document.querySelectorAll('[id^="sort-"]').forEach(span => {
        span.textContent = '';
    });
    const indicator = currentSortDirection === 'asc' ? '↑' : '↓';
    const sortIndicator = document.getElementById(`sort-${currentSortField}`);
    if (sortIndicator) {
        sortIndicator.textContent = indicator;
    }
}

function displayStockList() {
    const categoryFilter = document.getElementById('stock-category-filter');
    const selectedCategory = categoryFilter ? categoryFilter.value : '';

    Promise.all([
        apiRequest('/api/stock'),
        apiRequest('/api/shenzhen/stock')
    ])
    .then(([stock, szStock]) => {
        const categories = new Set();
        stock.forEach(item => categories.add(item.category));
        szStock.forEach(item => categories.add(item.category));

        if (categoryFilter) {
            categoryFilter.innerHTML = '<option value="">所有类别</option>' +
                Array.from(categories).map(cat =>
                    `<option value="${cat}" ${selectedCategory === cat ? 'selected' : ''}>${cat}</option>`
                ).join('');
        }

        updateSortIndicators();

        const groupedStock = {};

        // 常规库存（不包含深圳）
        stock.forEach(item => {
            if (selectedCategory && item.category !== selectedCategory) return;
            if (!groupedStock[item.product_id]) {
                groupedStock[item.product_id] = {
                    product_id: item.product_id,
                    name: item.name,
                    category: item.category,
                    supplier: item.supplier,
                    unit: item.unit,
                    total_stock: 0,
                    in_transit: item.in_transit || 0,
                    daily_consumption: item.daily_consumption || 0,
                    shenzhen_stock: 0,
                    specs: []
                };
            }

            let boxQuantity = 0;
            if (item.box_spec) {
                const match = item.box_spec.match(/^(\d+)/);
                if (match && match[1]) boxQuantity = parseInt(match[1]);
            }

            if (item.quantity > 0) {
                groupedStock[item.product_id].specs.push({
                    box_spec: item.box_spec,
                    quantity: item.quantity,
                    expiry_date: item.expiry_date,
                    batch_number: item.batch_number,
                    location: item.location,
                    unit_price: item.unit_price
                });

                const boxCount = parseInt(item.quantity || 0);
                const totalItems = boxQuantity * boxCount;
                groupedStock[item.product_id].total_stock += totalItems;
            }
        });

        // 深圳库存累计（不暴露规格或库位）
        szStock.forEach(item => {
            if (selectedCategory && item.category !== selectedCategory) return;
            if (!groupedStock[item.product_id]) {
                groupedStock[item.product_id] = {
                    product_id: item.product_id,
                    name: item.name,
                    category: item.category,
                    supplier: item.supplier,
                    unit: item.unit,
                    total_stock: 0,
                    in_transit: item.in_transit || 0,
                    daily_consumption: item.daily_consumption || 0,
                    shenzhen_stock: 0,
                    specs: []
                };
            }

            let boxQuantity = 0;
            if (item.box_spec) {
                const match = item.box_spec.match(/^(\d+)/);
                if (match && match[1]) boxQuantity = parseInt(match[1]);
            }
            if (item.quantity > 0) {
                const boxCount = parseInt(item.quantity || 0);
                const totalItems = boxQuantity * boxCount;
                groupedStock[item.product_id].shenzhen_stock += totalItems;
            }
        });

        const stockListBody = document.getElementById('stock-list-body');
        stockListBody.innerHTML = '';

        let productsArray = Object.values(groupedStock);
        productsArray.sort((a, b) => {
            let valueA, valueB;
            if (currentSortField === 'product_id') {
                valueA = a.product_id; valueB = b.product_id;
            } else if (currentSortField === 'stockout_date') {
                const stockToUseA = includeShenzhenStock ? a.total_stock + a.shenzhen_stock : a.total_stock;
                const stockToUseB = includeShenzhenStock ? b.total_stock + b.shenzhen_stock : b.total_stock;
                valueA = a.daily_consumption > 0 ? Math.floor(stockToUseA / a.daily_consumption) : Infinity;
                valueB = b.daily_consumption > 0 ? Math.floor(stockToUseB / b.daily_consumption) : Infinity;
            } else if (currentSortField === 'expiry_risk') {
                valueA = Infinity; valueB = Infinity;
                const today = new Date(); today.setHours(0,0,0,0);
                if (a.specs.length > 0) {
                    a.specs.forEach(spec => {
                        if (spec.expiry_date) {
                            const expiryDate = new Date(spec.expiry_date); expiryDate.setHours(0,0,0,0);
                            const daysDiff = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000*3600*24));
                            if (daysDiff < valueA) valueA = daysDiff;
                        }
                    });
                }
                if (b.specs.length > 0) {
                    b.specs.forEach(spec => {
                        if (spec.expiry_date) {
                            const expiryDate = new Date(spec.expiry_date); expiryDate.setHours(0,0,0,0);
                            const daysDiff = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000*3600*24));
                            if (daysDiff < valueB) valueB = daysDiff;
                        }
                    });
                }
            }
            if (currentSortDirection === 'asc') {
                return valueA > valueB ? 1 : -1;
            } else {
                return valueA < valueB ? 1 : -1;
            }
        });

        productsArray.forEach(product => {
            let stockoutDate = '无风险';
            let stockoutRisk = '无风险';
            let riskClass = 'no-risk';

            if (product.daily_consumption > 0) {
                const stockToUse = includeShenzhenStock ? product.total_stock + product.shenzhen_stock : product.total_stock;
                const daysToStockout = Math.floor(stockToUse / product.daily_consumption);
                const stockoutDateObj = new Date();
                stockoutDateObj.setDate(stockoutDateObj.getDate() + daysToStockout);
                stockoutDate = stockoutDateObj.toLocaleDateString();
                if (daysToStockout < 45) {
                    stockoutRisk = `${daysToStockout}天${includeShenzhenStock ? '' : '(仅香港)'}`;
                    riskClass = 'high-risk';
                }
            }

            const mainRow = document.createElement('tr');
            mainRow.classList.add('product-main-row');
            mainRow.setAttribute('data-product-id', product.product_id);

            let expiryRisk = '无风险';
            let expiryRiskClass = 'no-risk';
            if (product.specs.length > 0) {
                let daysToExpiry = Infinity;
                const today = new Date(); today.setHours(0,0,0,0);
                product.specs.forEach(spec => {
                    if (spec.expiry_date) {
                        const expiryDate = new Date(spec.expiry_date); expiryDate.setHours(0,0,0,0);
                        const diff = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000*3600*24));
                        if (diff < daysToExpiry) daysToExpiry = diff;
                    }
                });
                if (daysToExpiry < 365) {
                    expiryRisk = `${daysToExpiry}天`;
                    expiryRiskClass = daysToExpiry < 90 ? 'high-risk' : 'medium-risk';
                }
            }

            mainRow.innerHTML = `
                <td>${product.product_id}</td>
                <td onclick="showProductRecords('${product.product_id}')" style="cursor: pointer; text-decoration: underline; color: #0066cc;">${product.name}</td>
                <td onclick="makeEditable(this)" data-field="in_transit">${product.in_transit}</td>
                <td onclick="openShenzhenModal('${product.product_id}', '${product.name}')" style="cursor: pointer; text-decoration: underline; color: #0066cc;">${product.shenzhen_stock || 0}</td>
                <td>${product.total_stock}</td>
                <td onclick="makeEditable(this)" data-field="daily_consumption">${product.daily_consumption}</td>
                <td>${stockoutDate}</td>
                <td class="${riskClass}">${stockoutRisk}</td>
                <td class="${expiryRiskClass}">${expiryRisk}</td>
                <td>
                    <button onclick="toggleSpecRows('${product.product_id}')">查看规格</button>
                </td>
            `;
            stockListBody.appendChild(mainRow);

            product.specs.forEach(spec => {
                const specRow = document.createElement('tr');
                specRow.classList.add('product-spec-row');
                specRow.classList.add(`spec-${product.product_id}`);
                specRow.style.display = 'none';
                specRow.innerHTML = `
                    <td colspan="2">规格: ${spec.box_spec} </td>
                    <td colspan="2">箱数: ${spec.quantity}箱</td>
                    <td colspan="2">批次号: ${spec.batch_number}</td>
                    <td colspan="2">过期日期: ${spec.expiry_date ? new Date(spec.expiry_date).toLocaleDateString() : '无'}</td>
                    <td colspan="2">库位: ${spec.location || '未指定'} ${spec.location ? `<button class=\"small-button\" onclick=\"openRelocateModal('${product.product_id}', '${product.name}', '${spec.box_spec}', '${spec.batch_number || ''}', '${spec.expiry_date || ''}', '${spec.location}', ${spec.quantity})\">移位</button>` : ''}</td>
                `;
                stockListBody.appendChild(specRow);
            });
        });
    })
    .catch(error => {
        console.error('加载库存失败:', error);
        const stockListBody = document.getElementById('stock-list-body');
        if (stockListBody) {
            stockListBody.innerHTML = '<tr><td colspan="11">加载库存失败</td></tr>';
        }
    });
}

// 打开移位模态框
function openRelocateModal(productId, productName, boxSpec, batchNumber, expiryDate, fromLocation, availableQty) {
    const modal = document.getElementById('relocate-modal');
    if (!modal) return;
    modal.style.display = 'block';

    // 显示信息
    const productSpan = document.getElementById('relocate-product');
    if (productSpan) productSpan.textContent = `${productId} - ${productName}`;
    const specSpan = document.getElementById('relocate-spec');
    if (specSpan) specSpan.textContent = boxSpec || '未知';
    const fromLocSpan = document.getElementById('relocate-from-location');
    if (fromLocSpan) fromLocSpan.textContent = fromLocation || '未指定';
    const availableSpan = document.getElementById('relocate-available');
    if (availableSpan) availableSpan.textContent = availableQty || 0;

    // 保存数据在 dataset
    modal.dataset.productId = productId;
    modal.dataset.productName = productName;
    modal.dataset.boxSpec = boxSpec || '';
    modal.dataset.batchNumber = batchNumber || '';
    modal.dataset.expiryDate = expiryDate || '';
    modal.dataset.fromLocation = fromLocation || '';
    modal.dataset.availableQty = availableQty || 0;

    // 重置输入
    const qtyInput = document.getElementById('relocate-quantity');
    const toLocationSelect = document.getElementById('relocate-to-location');
    if (qtyInput) qtyInput.value = '';
    if (toLocationSelect) toLocationSelect.value = '';
}

// 关闭移位模态框
function closeRelocateModal() {
    const modal = document.getElementById('relocate-modal');
    if (modal) modal.style.display = 'none';
}

// 确认移位
function confirmRelocate() {
    const modal = document.getElementById('relocate-modal');
    if (!modal) return;

    const productId = modal.dataset.productId;
    const boxSpec = modal.dataset.boxSpec;
    const batchNumber = modal.dataset.batchNumber || null;
    const expiryDate = modal.dataset.expiryDate || null;
    const fromLocation = modal.dataset.fromLocation;
    const availableQty = parseInt(modal.dataset.availableQty || '0', 10);

    const toLocationElem = document.getElementById('relocate-to-location');
    const qtyElem = document.getElementById('relocate-quantity');
    const toLocation = toLocationElem ? toLocationElem.value : '';
    const quantity = parseInt(qtyElem ? qtyElem.value : '0', 10);

    if (!toLocation) { alert('请选择目标库位'); return; }
    if (!quantity || quantity <= 0) { alert('请输入有效的移位数量'); return; }
    if (quantity > availableQty) { alert('移位数量不能超过可移位箱数'); return; }

    const payload = {
        product_id: productId,
        box_spec: boxSpec,
        batch_number: batchNumber,
        expiry_date: expiryDate,
        from_location: fromLocation,
        to_location: toLocation,
        quantity: quantity
    };

    apiRequest('/api/stock/relocate', 'POST', payload)
        .then(res => {
            if (res.success) {
                alert('移位成功');
                closeRelocateModal();
                displayStockList();
            } else {
                alert(res.message || '移位失败');
            }
        })
        .catch(err => {
            alert(err.message || '移位失败');
        });
}

function populateStockFilters() {
    // 类别下拉在 displayStockList 中已填充
}

function toggleSpecRows(productId) {
    const specRows = document.querySelectorAll(`.spec-${productId}`);
    specRows.forEach(row => {
        row.style.display = row.style.display === 'none' ? 'table-row' : 'none';
    });
}

function makeEditable(cell) {
    if (!cell.querySelector('input')) {
        const value = cell.textContent;
        const input = document.createElement('input');
        input.type = 'number';
        input.value = value;
        input.min = '0';
        input.step = cell.dataset.field === 'daily_consumption' ? '0.1' : '1';
        cell.textContent = '';
        cell.appendChild(input);
        input.focus();

        const saveData = function() {
            const productId = cell.parentElement.dataset.productId;
            const newValue = input.value;
            const field = cell.dataset.field;

            const updateData = { product_id: productId };
            if (field === 'in_transit') {
                updateData.in_transit = parseInt(newValue);
            } else if (field === 'daily_consumption') {
                updateData.daily_consumption = parseFloat(newValue);
            } else if (field === 'shenzhen_stock') {
                updateData.shenzhen_stock = parseInt(newValue);
            }

            fetch('/api/stock/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updateData)
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    cell.textContent = newValue;
                    displayStockList();
                } else {
                    alert('保存失败：' + data.message);
                    cell.textContent = value;
                }
            })
            .catch(error => {
                console.error('Error:', error);
                alert('保存失败');
                cell.textContent = value;
            });
        };

        let isSaved = false;
        input.addEventListener('keydown', function(event) {
            if (event.key === 'Enter') {
                event.preventDefault();
                isSaved = true;
                saveData();
                input.blur();
            }
        });
        input.addEventListener('blur', function() {
            if (!isSaved && cell.contains(input)) {
                cell.textContent = value;
            }
        });
    }
}

function exportStockToExcel() {
    apiRequest('/api/stock')
        .then(stockItems => {
            const headers = ['产品编号', '品名', '产品类别', '供应商', '香港库存', '深圳库存', '在途数量', '每日消耗', '规格', '库位', '批次号', '过期日期'];
            const filteredStockItems = stockItems.filter(item => item.quantity > 0);
            const wsData = [
                headers,
                ...filteredStockItems.map(item => [
                    item.product_id,
                    item.name,
                    item.category,
                    item.supplier,
                    item.quantity,
                    item.shenzhen_stock || 0,
                    item.in_transit || 0,
                    item.daily_consumption || 0,
                    item.box_spec,
                    item.location,
                    item.batch_number || '',
                    item.expiry_date || ''
                ])
            ];
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.aoa_to_sheet(wsData);
            XLSX.utils.book_append_sheet(wb, ws, '库存');
            XLSX.writeFile(wb, '库存盘点.xlsx');
        })
        .catch(error => alert('导出库存失败: ' + error.message));
}

function uploadDailyConsumptionExcel() {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.xlsx, .xls';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);
    fileInput.click();
    fileInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (!file) { document.body.removeChild(fileInput); return; }
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, {type: 'array'});
                const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                const jsonData = XLSX.utils.sheet_to_json(worksheet);
                if (jsonData.length === 0) { alert('Excel文件为空'); document.body.removeChild(fileInput); return; }
                const firstRow = jsonData[0];
                if (!('产品编号' in firstRow) || !('每日消耗' in firstRow)) { alert('Excel文件格式不正确，必须包含"产品编号"和"每日消耗"列'); document.body.removeChild(fileInput); return; }
                const updatePromises = [];
                jsonData.forEach(row => {
                    const productId = row['产品编号'];
                    const dailyConsumption = parseFloat(row['每日消耗']) || 0;
                    if (productId) {
                        const updatePromise = fetch('/api/stock/update', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ product_id: productId, daily_consumption: dailyConsumption })
                        }).then(response => response.json());
                        updatePromises.push(updatePromise);
                    }
                });
                Promise.all(updatePromises)
                    .then(results => {
                        const successCount = results.filter(result => result.success).length;
                        alert(`批量更新成功，共更新${successCount}条记录`);
                        displayStockList();
                    })
                    .catch(error => { console.error('批量更新失败:', error); alert('批量更新失败: ' + error.message); });
            } catch (error) {
                console.error('处理Excel文件失败:', error);
                alert('处理Excel文件失败: ' + error.message);
            } finally {
                document.body.removeChild(fileInput);
            }
        };
        reader.onerror = function() { alert('读取文件失败'); document.body.removeChild(fileInput); };
        reader.readAsArrayBuffer(file);
    });
}

function exportAllMerchantsStockToExcel() {
    apiRequest('/api/all-merchants-stock')
        .then(stockItems => {
            const headers = ['商户名称', '产品编号', '品名', '产品类别', '供应商', '香港库存', '深圳库存', '规格', '库位', '批次号', '过期日期'];
            const filteredStockItems = stockItems.filter(item => item.quantity > 0);
            const wsData = [
                headers,
                ...filteredStockItems.map(item => [
                    item.merchant_name,
                    item.product_id,
                    item.name,
                    item.category,
                    item.supplier,
                    item.quantity,
                    item.shenzhen_stock || 0,
                    item.box_spec,
                    item.location,
                    item.batch_number || '',
                    item.expiry_date || ''
                ])
            ];
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.aoa_to_sheet(wsData);
            XLSX.utils.book_append_sheet(wb, ws, '所有商户库存');
            XLSX.writeFile(wb, '所有商户库存盘点.xlsx');
        })
        .catch(error => alert('导出所有商户库存失败: ' + error.message));
}