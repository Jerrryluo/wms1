// 出库相关模块：维护 outgoingList 状态，并使用 script.js 中的 apiRequest、displayStockList、displayRecords 等方法

// 出库列表状态
let outgoingList = [];

// 从localStorage加载待出库列表
function loadOutgoingListFromStorage() {
    apiRequest('/api/merchants/current')
        .then(response => {
            if (response.success && response.merchant) {
                const merchantId = response.merchant.id;
                const storedList = localStorage.getItem(`outgoingList_${merchantId}`);
                if (storedList) {
                    outgoingList = JSON.parse(storedList);
                    updateOutgoingListDisplay();
                } else {
                    outgoingList = [];
                    updateOutgoingListDisplay();
                }
            }
        })
        .catch(error => {
            console.error('获取当前商户失败:', error);
        });
}

// 保存待出库列表到localStorage
function saveOutgoingListToStorage() {
    apiRequest('/api/merchants/current')
        .then(response => {
            if (response.success && response.merchant) {
                const merchantId = response.merchant.id;
                localStorage.setItem(`outgoingList_${merchantId}`, JSON.stringify(outgoingList));
            }
        })
        .catch(error => {
            console.error('获取当前商户失败:', error);
        });
}

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', function() {
    loadOutgoingListFromStorage();
});

// 填充出库产品选择框（从 script.js 迁移）
function populateOutgoingProductSelect() {
    const outgoingProductSelect = document.getElementById('outgoing-product-select');
    if (!outgoingProductSelect) {
        return;
    }
    // 如果已是输入框（已增强），避免重复初始化
    if (outgoingProductSelect.tagName && outgoingProductSelect.tagName.toLowerCase() === 'input') {
        return;
    }
    const parentElement = outgoingProductSelect.parentNode;

    outgoingProductSelect.remove();

    const container = document.createElement('div');
    container.style.position = 'relative';
    container.style.width = '100%';

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.id = 'outgoing-product-select';
    searchInput.placeholder = '搜索或选择产品...';
    searchInput.style.width = '100%';
    searchInput.style.padding = '5px';
    searchInput.style.marginBottom = '0';
    searchInput.autocomplete = 'off';

    const dropdownList = document.createElement('div');
    dropdownList.style.display = 'none';
    dropdownList.style.position = 'absolute';
    dropdownList.style.width = '100%';
    dropdownList.style.maxHeight = '200px';
    dropdownList.style.overflowY = 'auto';
    dropdownList.style.border = '1px solid #ccc';
    dropdownList.style.borderTop = 'none';
    dropdownList.style.backgroundColor = 'white';
    dropdownList.style.zIndex = '1000';
    dropdownList.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';

    container.appendChild(searchInput);
    container.appendChild(dropdownList);
    parentElement.appendChild(container);

    let products = [];
    apiRequest('/api/products')
        .then(data => {
            products = data || [];
            renderDropdown(products);
        })
        .catch(error => {
            console.error('加载产品列表失败:', error);
        });

    function renderDropdown(list) {
        dropdownList.innerHTML = '';
        list.forEach(item => {
            const option = document.createElement('div');
            option.textContent = item.name;
            option.style.padding = '5px';
            option.style.borderBottom = '1px solid #eee';
            option.style.cursor = 'pointer';
            option.addEventListener('click', () => {
                searchInput.value = item.name;
                dropdownList.style.display = 'none';
                searchInput.getProductId = () => item.id;
                // 选择产品后，立即加载对应的规格
                if (typeof showProductSpecs === 'function') {
                    showProductSpecs();
                }
            });
            dropdownList.appendChild(option);
        });
    }

    searchInput.addEventListener('input', function() {
        const query = this.value.trim().toLowerCase();
        const filtered = products.filter(p => p.name.toLowerCase().includes(query));
        renderDropdown(filtered);
        dropdownList.style.display = filtered.length ? 'block' : 'none';
    });

    searchInput.addEventListener('focus', function() {
        dropdownList.style.display = products.length ? 'block' : 'none';
    });

    // 当输入框发生改变且已有选定产品ID时，尝试刷新规格
    searchInput.addEventListener('change', function() {
        if (typeof showProductSpecs === 'function') {
            showProductSpecs();
        }
    });

    document.addEventListener('click', function(event) {
        if (!container.contains(event.target)) {
            dropdownList.style.display = 'none';
        }
    });
}

// 显示产品规格供出库选择
function showProductSpecs() {
    const outgoingProductSelect = document.getElementById('outgoing-product-select');
    const boxSpecSelect = document.getElementById('outgoing-box-spec');
    const productId = outgoingProductSelect.getProductId ? outgoingProductSelect.getProductId() : outgoingProductSelect.value;

    boxSpecSelect.innerHTML = '<option value="">请选择规格</option>';

    if (productId) {
        fetch('/api/stock')
        .then(response => response.json())
        .then(stock => {
            const filteredStock = stock
                .filter(item =>
                    item.product_id === productId &&
                    item.quantity > 0
                )
                .sort((a, b) =>
                    new Date(a.expiry_date) - new Date(b.expiry_date)
                );

            filteredStock.forEach(item => {
                const option = document.createElement('option');
                option.value = item.box_spec;
                const expiryDateStr = item.expiry_date ? new Date(item.expiry_date).toLocaleDateString() : '无';
                option.textContent = `规格:${item.box_spec} 库存:${item.quantity}箱 库位:${item.location || '未指定'} 过期:${expiryDateStr}`;
                option.dataset.quantity = item.quantity;
                option.dataset.expiryDate = item.expiry_date || '';
                option.dataset.location = item.location || '';
                boxSpecSelect.appendChild(option);
            });
        });
    }
}

// 生成提货单
function generateDeliveryNote() {
    if (outgoingList.length === 0) {
        alert('待出库列表为空');
        return;
    }

    const wb = XLSX.utils.book_new();
    const wsData = [[ '品名', '库位', '规格', '数量', '批次号', '过期日期', '确认提货（勾选已提货项目）']];

    const currentMerchantEl = document.getElementById('current-merchant-name');
    if (!currentMerchantEl) {
        console.error('当前商户名称元素不存在');
        return;
    }
    const currentMerchant = currentMerchantEl.textContent;
    const deliveryDate = new Date().toLocaleDateString();
    const totalBoxes = outgoingList.reduce((sum, item) => sum + item.quantity, 0);

    outgoingList.forEach(item => {
        wsData.push([
            item.product_name,
            item.location || '未指定',
            item.box_spec,
            item.quantity,
            item.batch_number || '无',
            item.expiry_date,
            ''
        ]);
    });
    wsData.push(['', '', '', '', '', '']);
    wsData.push(['商户名称',currentMerchant, '提货日期',deliveryDate]);
    wsData.push(['', '', '', '', '', '']);
    wsData.push(['总提货箱数', totalBoxes, '', '核对提货', '共计', '        箱']);
    wsData.push(['', '', '', '', '', '']);
    wsData.push(['', '', '', '', '', '']);
    wsData.push(['提货人签字: __________   复核人签字: __________']);

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, '提货单');
    XLSX.writeFile(wb, `提货单_${new Date().toISOString().slice(0,10)}.xlsx`);
}

// 添加到待出库列表
function addToOutgoingList() {
    const productSelect = document.getElementById('outgoing-product-select');
    const boxSpecSelect = document.getElementById('outgoing-box-spec');
    const quantityInput = document.getElementById('outgoing-quantity');
    const outgoingReasonElement = document.getElementById('outgoing-reason');

    if (!productSelect || !boxSpecSelect || !quantityInput || !outgoingReasonElement) {
        console.error('出库操作：找不到必需的DOM元素');
        return;
    }

    const outgoingReason = outgoingReasonElement.value;
    const productId = productSelect.getProductId ? productSelect.getProductId() : productSelect.value;
    const productName = productSelect.value || '未知产品';
    const boxSpec = boxSpecSelect.value;
    const quantity = parseInt(quantityInput.value);
    const location = boxSpecSelect.selectedIndex >= 0 ? boxSpecSelect.options[boxSpecSelect.selectedIndex].dataset.location : '';

    if (!productId || !boxSpec || !quantity || !outgoingReason) {
        alert('请填写完整信息');
        return;
    }

    fetch('/api/stock')
        .then(response => response.json())
        .then(stock => {
            const selectedExpiryDate = boxSpecSelect.selectedIndex >= 0 ? boxSpecSelect.options[boxSpecSelect.selectedIndex].dataset.expiryDate : '';
            let currentStock = stock.find(s =>
                s.product_id === productId &&
                s.box_spec === boxSpec &&
                s.location === location &&
                s.expiry_date === selectedExpiryDate &&
                s.quantity > 0
            );

            if (!currentStock) {
                alert('您选择的库存（包括过期日期）不存在或已售罄，请重新选择');
                return;
            }

            if (quantity > currentStock.quantity) {
                alert('出库数量不能大于库存数量');
                return;
            }

            const existingItem = outgoingList.find(item =>
                item.product_id === productId &&
                item.box_spec === boxSpec &&
                item.location === currentStock.location
            );

            if (existingItem) {
                alert('该产品规格已在待出库列表中');
                return;
            }

            outgoingList.push({
                product_id: productId,
                product_name: productName,
                box_spec: boxSpec,
                quantity: quantity,
                outgoing_reason: outgoingReason,
                batch_number: currentStock.batch_number,
                expiry_date: currentStock.expiry_date,
                location: currentStock.location
            });

            updateOutgoingListDisplay();
            saveOutgoingListToStorage();

            quantityInput.value = '';
            boxSpecSelect.value = '';
            productSelect.value = '';
            outgoingReasonElement.value = '生产';
        })
        .catch(error => {
            console.error('Error:', error);
            alert('添加到待出库列表失败: ' + error.message);
        });
}

// 确认出库
function confirmOutgoing() {
    if (outgoingList.length === 0) {
        alert('待出库列表为空');
        return;
    }

    const promises = outgoingList.map(item => {
        return fetch('/api/outgoing', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                product_id: item.product_id,
                box_spec: item.box_spec,
                quantity: item.quantity,
                outgoing_reason: item.outgoing_reason,
                location: item.location,
                batch_number: item.batch_number,
                expiry_date: item.expiry_date
            })
        }).then(response => response.json());
    });

    Promise.all(promises)
        .then(results => {
            const hasError = results.some(result => result.error);
            if (hasError) {
                alert('部分出库操作失败');
            } else {
                alert('出库操作成功');
                outgoingList = [];
                apiRequest('/api/merchants/current')
                    .then(response => {
                        if (response.success && response.merchant) {
                            const merchantId = response.merchant.id;
                            localStorage.removeItem(`outgoingList_${merchantId}`);
                        }
                    })
                    .catch(error => {
                        console.error('获取当前商户失败:', error);
                    });
                updateOutgoingListDisplay();
                displayStockList();
                displayRecords();
            }
        })
        .catch(error => {
            console.error('Error:', error);
            alert('出库操作失败: ' + error.message);
        });
}

// 更新待出库列表显示
function updateOutgoingListDisplay() {
    const tbody = document.getElementById('outgoing-products-body');
    tbody.innerHTML = '';

    outgoingList.forEach((item, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${item.product_name}</td>
            <td>${item.location || '未指定'}</td>
            <td>${item.box_spec}</td>
            <td>${item.quantity}</td>
            <td>${item.batch_number}</td>
            <td>${item.expiry_date}</td>
            <td>
                <button onclick="removeFromOutgoingList(${index})">删除</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// 从待出库列表中移除
function removeFromOutgoingList(index) {
    outgoingList.splice(index, 1);
    updateOutgoingListDisplay();
    saveOutgoingListToStorage();
}