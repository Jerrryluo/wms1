// 显示指定的 tab 内容
function showTab(tabId) {
    const tabs = document.querySelectorAll('.tab-content');
    tabs.forEach(tab => {
        tab.style.display = 'none';
    });
    const selectedTab = document.getElementById(tabId);
    selectedTab.style.display = 'block';
    if (tabId === 'product') {
        displayProductList();
    } else if (tabId === 'incoming') {
        populateIncomingProductSelect();
    } else if (tabId === 'outgoing') {
        populateOutgoingProductSelect();
    } else if (tabId === 'records') {
        displayRecords();
    } else if (tabId === 'stock') {
        displayStockList();
    }
}

// 新增产品
function addProduct() {
    const productId = document.getElementById('new-product-id').value;
    const productName = document.getElementById('new-product-name').value;
    const productEnglishName = document.getElementById('new-product-english-name').value;
    const productCategory = document.getElementById('new-product-category').value;
    const productSupplier = document.getElementById('new-product-supplier').value;
    const productUnit = document.getElementById('new-product-unit').value;

    // 检查必填项
    if (!productId || !productName || !productEnglishName || !productCategory || !productSupplier || !productUnit) {
        alert('请填写所有必填项');
        return;
    }

    const product = {
        id: productId,
        name: productName,
        english_name: productEnglishName,
        category: productCategory,
        supplier: productSupplier,
        unit: productUnit
    };

    // 使用 fetch API 发送 POST 请求
    fetch('/api/products', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(product)
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('网络响应不正常');
        }
        return response.json();
    })
    .then(data => {
        alert(data.message);
        displayProductList();
    })
    .catch(error => {
        console.error('Error:', error);
        alert('添加产品失败: ' + error.message);
    });

    // 清空输入框
    document.getElementById('new-product-id').value = '';
    document.getElementById('new-product-name').value = '';
    document.getElementById('new-product-english-name').value = '';
    document.getElementById('new-product-category').value = '';
    document.getElementById('new-product-supplier').value = '';
    document.getElementById('new-product-unit').value = '';
}

// 显示产品列表
function displayProductList() {
    const productListBody = document.getElementById('product-list-body');
    productListBody.innerHTML = '';

    // 使用 fetch API 发送 GET 请求
    fetch('/api/products')
    .then(response => response.json())
    .then(products => {
        products.forEach(product => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${product.id}</td>
                <td>${product.name}</td>
                <td>${product.english_name}</td>
                <td>${product.category}</td>
                <td>${product.supplier}</td>
                <td>${product.unit}</td>
            `;
            productListBody.appendChild(row);
        });
    })
    .catch(error => {
        console.error('Error:', error);
    });
}

// 入库操作
function recordIncoming() {
    const incomingProductId = document.getElementById('incoming-product-id').value;
    const boxSpec = document.getElementById('incoming-box-spec').value;
    const boxQuantity = parseInt(document.getElementById('incoming-box-quantity').value);
    const shelfLife = document.getElementById('incoming-shelf-life').value;

    // 检查必填项
    if (!incomingProductId || !boxSpec || !boxQuantity || !shelfLife) {
        alert('请填写所有必填项');
        return;
    }

    const incomingRecord = {
        product_id: incomingProductId,
        box_spec: boxSpec,
        quantity: boxQuantity,
        expiry_date: shelfLife
    };

    // 使用 fetch API 发送 POST 请求
    fetch('/api/incoming', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(incomingRecord)
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(err => {
                throw new Error(err.message || '网络响应不正常');
            });
        }
        return response.json();
    })
    .then(data => {
        alert(data.message); // 显示成功消息
        // 清空输入框
        document.getElementById('incoming-product-id').value = '';
        document.getElementById('incoming-box-spec').value = '';
        document.getElementById('incoming-box-quantity').value = '';
        document.getElementById('incoming-shelf-life').value = '';
    })
    .catch(error => {
        console.error('Error:', error);
        alert('入库操作失败: ' + error.message);
    });
}

// 填充入库产品选择框
function populateIncomingProductSelect() {
    const incomingProductSelect = document.getElementById('incoming-product-id');
    incomingProductSelect.innerHTML = '';

    fetch('/api/products')
    .then(response => response.json())
    .then(products => {
        products.forEach(product => {
            const option = document.createElement('option');
            option.value = product.id;
            option.textContent = `${product.id} - ${product.name}`;
            incomingProductSelect.appendChild(option);
        });
    })
    .catch(error => {
        console.error('Error:', error);
    });
}

// 填充出库产品选择框
function populateOutgoingProductSelect() {
    const outgoingProductSelect = document.getElementById('outgoing-product-select');
    outgoingProductSelect.innerHTML = '<option value="">请选择产品</option>'; // 默认空白

    fetch('/api/products')
    .then(response => response.json())
    .then(products => {
        products.forEach(product => {
            const option = document.createElement('option');
            option.value = product.id;
            option.textContent = `${product.id} - ${product.name}`;
            outgoingProductSelect.appendChild(option);
        });
    })
    .catch(error => {
        console.error('Error:', error);
    });
}

// 显示出入库记录
function displayRecords() {
    const recordListBody = document.getElementById('record-list-body');
    recordListBody.innerHTML = '';

    fetch('/api/records')
    .then(response => response.json())
    .then(records => {
        records.forEach(record => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${record.id}</td>
                <td>${record.product_id}</td>
                <td>${record.product_name}</td>
                <td>${record.quantity}</td>
                <td>${record.date}</td>
                <td>${record.operation_type}</td>
            `;
            recordListBody.appendChild(row);
        });
    })
    .catch(error => {
        console.error('Error:', error);
    });
}

// 显示库存列表
function displayStockList() {
    const stockListBody = document.getElementById('stock-list-body');
    stockListBody.innerHTML = '';

    fetch('/api/stock')
    .then(response => response.json())
    .then(stock => {
        // 按产品ID分组
        const groupedStock = {};
        stock.forEach(item => {
            if (!groupedStock[item.product_id]) {
                groupedStock[item.product_id] = {
                    product_id: item.product_id,
                    name: item.name,
                    english_name: item.english_name,
                    category: item.category,
                    supplier: item.supplier,
                    unit: item.unit,
                    total_stock: 0,
                    in_transit: item.in_transit || 0,
                    daily_consumption: item.daily_consumption || 0,
                    specs: []
                };
            }
            
            // 计算该规格的总数量（箱数 * 规格数量）
            const specQuantity = item.quantity * parseInt(item.box_spec);
            groupedStock[item.product_id].total_stock += specQuantity;
            groupedStock[item.product_id].specs.push({
                box_spec: item.box_spec,
                quantity: item.quantity,
                expiry_date: item.expiry_date
            });
        });

        // 渲染分组后的数据
        Object.values(groupedStock).forEach(product => {
            // 创建主行（产品行）
            const mainRow = document.createElement('tr');
            mainRow.classList.add('product-main-row');
            mainRow.dataset.productId = product.product_id;
            mainRow.innerHTML = `
                <td>${product.product_id}</td>
                <td>${product.name}</td>
                <td>${product.english_name}</td>
                <td>${product.category}</td>
                <td>${product.supplier}</td>
                <td>${product.unit}</td>
                <td>${product.total_stock}</td>
                <td class="editable" onclick="makeEditable(this)" data-field="in_transit">${product.in_transit}</td>
                <td class="editable" onclick="makeEditable(this)" data-field="daily_consumption">${product.daily_consumption}</td>
                <td>
                    <button onclick="toggleSpecRows('${product.product_id}')">查看规格</button>
                </td>
                <td>
                    <button onclick="saveProductChanges('${product.product_id}', this.parentElement.parentElement)">保存</button>
                </td>
            `;
            stockListBody.appendChild(mainRow);

            // 对规格按过期日期排序
            product.specs.sort((a, b) => new Date(a.expiry_date) - new Date(b.expiry_date));

            // 创建规格行（默认隐藏）
            product.specs.forEach(spec => {
                const specRow = document.createElement('tr');
                specRow.classList.add('product-spec-row');
                specRow.classList.add(`spec-${product.product_id}`);
                specRow.style.display = 'none';
                specRow.innerHTML = `
                    <td colspan="6"></td>
                    <td colspan="3">规格: ${spec.box_spec} - ${spec.quantity}箱</td>
                    <td>过期日期: ${spec.expiry_date}</td>
                    <td></td>
                `;
                stockListBody.appendChild(specRow);
            });
        });
    })
    .catch(error => {
        console.error('Error:', error);
    });
}

// 切换规格行的显示/隐藏
function toggleSpecRows(productId) {
    const specRows = document.querySelectorAll(`.spec-${productId}`);
    specRows.forEach(row => {
        row.style.display = row.style.display === 'none' ? 'table-row' : 'none';
    });
}

// 使单元格可编辑
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
    }
}

// 保存产品变更
function saveProductChanges(productId, row) {
    const inTransitCell = row.querySelector('[data-field="in_transit"]');
    const dailyConsumptionCell = row.querySelector('[data-field="daily_consumption"]');
    
    const inTransitInput = inTransitCell.querySelector('input');
    const dailyConsumptionInput = dailyConsumptionCell.querySelector('input');
    
    const inTransit = inTransitInput ? parseInt(inTransitInput.value) : parseInt(inTransitCell.textContent);
    const dailyConsumption = dailyConsumptionInput ? parseFloat(dailyConsumptionInput.value) : parseFloat(dailyConsumptionCell.textContent);

    fetch('/api/stock/update', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            product_id: productId,
            in_transit: inTransit,
            daily_consumption: dailyConsumption
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            if (inTransitInput) {
                inTransitCell.textContent = inTransit;
            }
            if (dailyConsumptionInput) {
                dailyConsumptionCell.textContent = dailyConsumption;
            }
        } else {
            alert('保存失败：' + data.message);
        }
    })
    .catch(error => {
        console.error('Error:', error);
        alert('保存失败，请重试');
    });
}

// 添加待出库列表数组
let outgoingList = [];

// 修改显示产品规格的函数
function showProductSpecs() {
    const outgoingProductSelect = document.getElementById('outgoing-product-select');
    const boxSpecSelect = document.getElementById('outgoing-box-spec');
    const productId = outgoingProductSelect.value;
    
    boxSpecSelect.innerHTML = '<option value="">请选择规格</option>';
    
    if (productId) {
        fetch('/api/stock')
        .then(response => response.json())
        .then(stock => {
            const filteredStock = stock.filter(item => item.product_id === productId);
            filteredStock.forEach(item => {
                const option = document.createElement('option');
                option.value = item.box_spec;
                option.textContent = `${item.box_spec} (库存: ${item.quantity}箱)`;
                option.dataset.quantity = item.quantity;
                boxSpecSelect.appendChild(option);
            });
        });
    }
}

// 生成提货单
function generateDeliveryNote() {
    let content = '提货单\n';
    content += '日期：' + new Date().toLocaleString() + '\n\n';
    
    // 按产品ID分组计算
    const groupedProducts = outgoingList.reduce((acc, item) => {
        if (!acc[item.product_id]) {
            acc[item.product_id] = {
                product_name: item.product_name,
                total_quantity: 0,
                specs: []
            };
        }
        acc[item.product_id].total_quantity += item.quantity;
        acc[item.product_id].specs.push({
            box_spec: item.box_spec,
            quantity: item.quantity,
            expiry_date: item.expiry_date
        });
        return acc;
    }, {});
    
    // 计算总数据
    const totalTypes = Object.keys(groupedProducts).length;
    const totalBoxes = outgoingList.reduce((sum, item) => sum + item.quantity, 0);
    content += `总计：${totalTypes}个产品，${totalBoxes}箱\n\n`;
    
    content += '产品清单：\n';
    content += '品名（总箱数）\t规格明细\t过期日期\n';
    
    Object.entries(groupedProducts).forEach(([_, product]) => {
        content += `${product.product_name} (${product.total_quantity}箱)\n`;
        product.specs.forEach(spec => {
            content += `\t${spec.box_spec} - ${spec.quantity}箱\t${spec.expiry_date}\n`;
        });
    });
    
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '提货单_' + new Date().getTime() + '.txt';
    a.click();
}

// 确认出库
function confirmOutgoing() {
    if (outgoingList.length === 0) {
        alert('待出库列表为空');
        return;
    }
    
    // 创建所有出库请求的数组
    const outgoingRequests = outgoingList.map(item => 
        fetch('/api/outgoing', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(item)
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                throw new Error(data.message);
            }
            return data;
        })
    );
    
    // 同时处理所有出库请求
    Promise.all(outgoingRequests)
        .then(results => {
            // 生成出库成功提示内容
            const groupedProducts = outgoingList.reduce((acc, item) => {
                if (!acc[item.product_id]) {
                    acc[item.product_id] = {
                        product_name: item.product_name,
                        total_quantity: 0,
                        specs: []
                    };
                }
                acc[item.product_id].total_quantity += item.quantity;
                acc[item.product_id].specs.push({
                    box_spec: item.box_spec,
                    quantity: item.quantity,
                    expiry_date: item.expiry_date
                });
                return acc;
            }, {});

            let successMessage = '出库成功！\n\n';
            successMessage += '日期：' + new Date().toLocaleString() + '\n\n';
            
            const totalTypes = Object.keys(groupedProducts).length;
            const totalBoxes = outgoingList.reduce((sum, item) => sum + item.quantity, 0);
            successMessage += `总计：${totalTypes}个产品，${totalBoxes}箱\n\n`;
            
            successMessage += '出库清单：\n';
            successMessage += '品名（总箱数）\t规格明细\t过期日期\n';
            Object.entries(groupedProducts).forEach(([_, product]) => {
                successMessage += `${product.product_name} (${product.total_quantity}箱)\n`;
                product.specs.forEach(spec => {
                    successMessage += `\t${spec.box_spec} - ${spec.quantity}箱\t${spec.expiry_date}\n`;
                });
            });
            
            alert(successMessage);
            outgoingList = [];
            updateOutgoingTable();
            showTab('stock'); // 刷新并切换到库存页面
        })
        .catch(error => {
            console.error('Error:', error);
            alert('出库操作失败：' + error.message);
        });
}

// 添加到待出库列表
function addToOutgoingList() {
    const productSelect = document.getElementById('outgoing-product-select');
    const boxSpecSelect = document.getElementById('outgoing-box-spec');
    const quantityInput = document.getElementById('outgoing-quantity');
    
    const productId = productSelect.value;
    const boxSpec = boxSpecSelect.value;
    const quantity = parseInt(quantityInput.value);
    
    if (!productId || !boxSpec || !quantity) {
        alert('请填写完整信息');
        return;
    }
    
    // 获取当前选择规格的库存数量和过期日期
    fetch('/api/stock')
    .then(response => response.json())
    .then(stock => {
        const currentStock = stock.find(s => 
            s.product_id === productId && 
            s.box_spec === boxSpec
        );
        
        if (!currentStock) {
            alert('无法获取库存信息');
            return;
        }
        
        if (quantity > currentStock.quantity) {
            alert('出库数量不能大于库存数量');
            return;
        }
        
        // 检查是否已经在列表中
        const existingItem = outgoingList.find(item => 
            item.product_id === productId && 
            item.box_spec === boxSpec
        );
        
        if (existingItem) {
            alert('该产品规格已在待出库列表中');
            return;
        }
        
        // 获取产品信息并添加到列表
        fetch('/api/products')
        .then(response => response.json())
        .then(products => {
            const product = products.find(p => p.id === productId);
            if (!product) {
                alert('无法获取产品信息');
                return;
            }
            
            outgoingList.push({
                product_id: productId,
                product_name: product.name,
                box_spec: boxSpec,
                quantity: quantity,
                expiry_date: currentStock.expiry_date
            });
            
            updateOutgoingTable();
            clearOutgoingForm();
        });
    });
}

// 更新待出库表格
function updateOutgoingTable() {
    const tbody = document.getElementById('outgoing-products-body');
    tbody.innerHTML = '';
    
    outgoingList.forEach((item, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${item.product_name}</td>
            <td>${item.box_spec}</td>
            <td>${item.quantity}</td>
            <td>${item.expiry_date}</td>
            <td>
                <button onclick="removeFromOutgoingList(${index})">删除</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// 从待出库列表中删除
function removeFromOutgoingList(index) {
    outgoingList.splice(index, 1);
    updateOutgoingTable();
}

// 页面加载完成后初始化显示产品列表
window.onload = function () {
    displayProductList(); // 加载产品列表
    populateIncomingProductSelect(); // 填充入库产品选择框
    populateOutgoingProductSelect(); // 填充出库产品选择框
};