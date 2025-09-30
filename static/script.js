// 全局变量
let current_merchant = { name: '未知商户' };

// 页面标签切换函数，控制不同功能模块的显示和隐藏，并触发相应的数据加载
function showTab(tabName) {
    // 隐藏所有标签页
    const tabContents = document.querySelectorAll('.tab-content');
    tabContents.forEach(tab => {
        tab.style.display = 'none';
    });

    // 显示选中的标签页
    const selectedTab = document.getElementById(tabName);
    if (selectedTab) {
        selectedTab.style.display = 'block';
    }

    // 根据标签页按需加载相关数据
    if (tabName === 'user') {
        loadUsers();
        loadPermissions('new-user-permissions');  // 确保权限列表被加载
    } else if (tabName === 'merchant') {
        loadMerchants();
    } else if (tabName === 'stock') {
        // 按需加载库存数据
        displayStockList();
        // 初始化断货风险计算按钮文本
        const toggleButton = document.getElementById('toggle-stockout-calculation');
        if (toggleButton) {
            toggleButton.textContent = `切换断货风险计算（当前：${includeShenzhenStock ? '深圳+香港' : '仅香港'}）`;
        }
    } else if (tabName === 'records') {
        // 按需加载出入库记录数据
        displayRecords();
        populateRecordFilters();
    } else if (tabName === 'location-query') {
        // 按需加载库位查询数据
        getCurrentMerchant();
        loadLocations(); // 加载库位选择器
        populateRelocationProductSelect(); // 填充移位产品选择框
    } else if (tabName === 'incoming') {
    
        loadIncomingListFromStorage(); // 加载待入库列表
        populateIncomingProductSelect(); // 加载产品选择框
    } else if (tabName === 'relocation') {
        populateRelocationProductSelect();
    }
}

// 获取当前商户信息
function getCurrentMerchant() {
    apiRequest('/api/merchants/current')
        .then(response => {
            if (response.success) {
                current_merchant = response.merchant;
            }
        })
        .catch(error => {
            console.error('获取当前商户信息失败:', error);
        });
}

// 产品添加函数，处理新产品的表单提交和后端交互，包括数据验证和错误处理
function addProduct() {
    const productId = document.getElementById('new-product-id').value;
    const productName = document.getElementById('new-product-name').value;
    const productCategory = document.getElementById('new-product-category').value;
    const productSupplier = document.getElementById('new-product-supplier').value;
    const productUnit = document.getElementById('new-product-unit').value;

    // 检查必填项
    if (!productId || !productName || !productCategory || !productSupplier || !productUnit) {
        alert('请填写所有必填项');
        return;
    }

    const product = {
        id: productId,
        name: productName,
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
        populateIncomingProductSelect();
        populateOutgoingProductSelect();
    })
    .catch(error => {
        console.error('Error:', error);
        alert('添加产品失败: ' + error.message);
    });

    // 清空输入框
    document.getElementById('new-product-id').value = '';
    document.getElementById('new-product-name').value = '';

    document.getElementById('new-product-category').value = '';
    document.getElementById('new-product-supplier').value = '';
    document.getElementById('new-product-unit').value = '';
}

// 全局变量用于存储产品列表
let productList = [];

// 产品列表显示函数，从后端获取产品数据并渲染到页面表格中
function displayProductList() {
    const productListBody = document.getElementById('product-list-body');
    productListBody.innerHTML = '';

    // 使用apiRequest函数获取产品列表
    apiRequest('/api/products')
        .then(products => {
            productList = products; // 存储产品列表
            renderProductList(productList); // 渲染产品列表
        })
        .catch(error => {
            console.error('加载产品列表失败:', error);
            productList.innerHTML = '加载产品列表失败';
        });

    // 设置定时刷新，每60秒更新一次数据
}

// 渲染产品列表
function renderProductList(products) {
    const productListBody = document.getElementById('product-list-body');
    productListBody.innerHTML = products.map(product => `
        <tr>
            <td>${product.id}</td>
            <td onclick="showProductRecords('${product.product_id}')" style="cursor: pointer; text-decoration: underline; color: #0066cc;">${product.name}</td>

            <td>${product.category}</td>
            <td>${product.supplier}</td>
            <td>${product.unit}</td>
            <td>
                <button onclick="confirmDeleteProduct('${product.id}', '${product.name}')">删除</button>
            </td>
        </tr>
    `).join('');
}

// 产品列表排序函数，支持多字段排序，更新显示顺序
function sortProductList(key) {
    const sortedProducts = [...productList].sort((a, b) => {
        if (a[key] < b[key]) return -1;
        if (a[key] > b[key]) return 1;
        return 0;
    });
    renderProductList(sortedProducts);
}

// 添加待入库列表数组
let incomingList = [];

// 从localStorage加载待入库列表
function loadIncomingListFromStorage() {
    // 获取当前商户ID
    apiRequest('/api/merchants/current')
        .then(response => {
            if (response.success && response.merchant) {
                const merchantId = response.merchant.id;
                const storedList = localStorage.getItem(`incomingList_${merchantId}`);
                if (storedList) {
                    incomingList = JSON.parse(storedList);
                    updateIncomingListDisplay();
                } else {
                    incomingList = [];
                    updateIncomingListDisplay();
                }
            }
        })
        .catch(error => {
            console.error('获取当前商户失败:', error);
        });
}

// 保存待入库列表到localStorage
function saveIncomingListToStorage() {
    // 获取当前商户ID
    apiRequest('/api/merchants/current')
        .then(response => {
            if (response.success && response.merchant) {
                const merchantId = response.merchant.id;
                localStorage.setItem(`incomingList_${merchantId}`, JSON.stringify(incomingList));
            }
        })
        .catch(error => {
            console.error('获取当前商户失败:', error);
        });
}

// 添加到待入库列表函数
function addToIncomingList() {
    const productSelect = document.getElementById('incoming-product-id');
    const productId = productSelect.getProductId();
    const productName = productSelect.value || '未知产品';
    const boxSpec = document.getElementById('incoming-box-spec').value;
    const quantity = document.getElementById('incoming-box-quantity').value;
    const batchNumber = document.getElementById('incoming-batch-number').value;
    const reason = document.getElementById('incoming-reason').value;
    const shelfLife = document.getElementById('incoming-shelf-life').value;
    const location = document.getElementById('incoming-location').value;

    if (!productId || !boxSpec || !quantity || !batchNumber || !reason || !shelfLife || !location) {
        alert('请填写所有必填字段');
        return;
    }

    if (parseInt(quantity) <= 0) {
        alert('入库数量必须大于0');
        return;
    }

    // 检查是否已在列表中
    const existingItem = incomingList.find(item =>
        item.product_id === productId &&
        item.box_spec === boxSpec &&
        item.batch_number === batchNumber &&
        item.location === location
    );

    if (existingItem) {
        alert('该产品规格已在待入库列表中');
        return;
    }

    // 添加到待入库列表
    incomingList.push({
        product_id: productId,
        product_name: productName,
        box_spec: boxSpec,
        quantity: parseInt(quantity),
        batch_number: batchNumber,
        incoming_reason: reason,
        expiry_date: shelfLife,
        location: location
    });

    // 更新待入库列表显示并保存到localStorage
    updateIncomingListDisplay();
    saveIncomingListToStorage();

    // 清空表单
    document.getElementById('incoming-box-spec').value = '';
    document.getElementById('incoming-box-quantity').value = '';
    document.getElementById('incoming-batch-number').value = new Date().toISOString().slice(0,10).replace(/-/g,'');
    document.getElementById('incoming-shelf-life').value = '';
    document.getElementById('incoming-location').value = '';
}

// 更新待入库列表显示
function updateIncomingListDisplay() {
    const tbody = document.getElementById('incoming-products-body');
    if (!tbody) return;
    
    tbody.innerHTML = '';

    incomingList.forEach((item, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${item.product_name}</td>
            <td>${item.location || '未指定'}</td>
            <td>${item.box_spec}</td>
            <td>${item.quantity}</td>
            <td>${item.batch_number}</td>
            <td>${item.expiry_date}</td>
            <td>${item.incoming_reason}</td>
            <td>
                <button onclick="removeFromIncomingList(${index})">删除</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// 从待入库列表中移除
function removeFromIncomingList(index) {
    incomingList.splice(index, 1);
    updateIncomingListDisplay();
    saveIncomingListToStorage();
}

// 入库记录函数，处理入库操作的表单提交和后端交互，包括数据验证
function recordIncoming() {
    if (incomingList.length === 0) {
        alert('待入库列表为空');
        return;
    }

    // 创建所有入库请求的数组
    const incomingRequests = incomingList.map(item =>
        apiRequest('/api/incoming', 'POST', {
            product_id: item.product_id,
            box_spec: item.box_spec,
            quantity: item.quantity,
            batch_number: item.batch_number,
            incoming_reason: item.incoming_reason,
            expiry_date: item.expiry_date,
            location: item.location
        })
    );

    // 同时处理所有入库请求
    Promise.all(incomingRequests)
        .then(results => {
            // 生成入库成功提示内容
            const groupedProducts = incomingList.reduce((acc, item) => {
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
                    location: item.location
                });
                return acc;
            }, {});

            let successMessage = '入库成功！\n\n';
            successMessage += '日期：' + new Date().toLocaleString() + '\n\n';

            const totalTypes = Object.keys(groupedProducts).length;
            const totalBoxes = incomingList.reduce((sum, item) => sum + item.quantity, 0);
            successMessage += `总计：${totalTypes}个产品，${totalBoxes}箱\n\n`;

            successMessage += '入库清单：\n';
            successMessage += '品名（总箱数）\t规格明细\t库位\n';

            for (const productId in groupedProducts) {
                const product = groupedProducts[productId];
                successMessage += `${product.product_name}（${product.total_quantity}箱）\n`;
                product.specs.forEach(spec => {
                    successMessage += `\t${spec.box_spec}\t${spec.quantity}箱\t${spec.location}\n`;
                });
            }

            alert(successMessage);

            // 清空待入库列表
            incomingList = [];
            
            // 清除localStorage中的数据
            apiRequest('/api/merchants/current')
                .then(response => {
                    if (response.success && response.merchant) {
                        const merchantId = response.merchant.id;
                        localStorage.removeItem(`incomingList_${merchantId}`);
                    }
                })
                .catch(error => {
                    console.error('获取当前商户失败:', error);
                });

            updateIncomingListDisplay();
            
            // 更新库存和记录显示
            if (document.getElementById('stock').style.display === 'block') {
                displayStockList();
            }
            if (document.getElementById('records').style.display === 'block') {
                displayRecords();
            }
        })
        .catch(error => {
            handleApiError(error, '入库操作');
        });
}

// 填充入库产品选择框
function populateIncomingProductSelect() {
    const incomingProductSelect = document.getElementById('incoming-product-id');
    const parentElement = incomingProductSelect.parentNode;
    
    // 移除原有的select元素
    incomingProductSelect.remove();
    
    // 创建新的输入框和下拉列表容器
    const container = document.createElement('div');
    container.style.position = 'relative';
    container.style.width = '100%';
    
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.id = 'incoming-product-id';
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

    let selectedProductId = '';
    
    apiRequest('/api/products')
        .then(products => {
            const allProducts = products;
            
            function updateDropdownList(filterTerm = '') {
                dropdownList.innerHTML = '';
                const filteredProducts = filterTerm
                    ? allProducts.filter(product =>
                        product.name.toLowerCase().includes(filterTerm.toLowerCase()) ||
                        product.id.toLowerCase().includes(filterTerm.toLowerCase()))
                    : allProducts;
                
                filteredProducts.forEach(product => {
                    const item = document.createElement('div');
                    item.style.padding = '8px';
                    item.style.cursor = 'pointer';
                    item.style.borderBottom = '1px solid #eee';
                    item.textContent = product.name;
                    
                    item.addEventListener('mouseover', () => {
                        item.style.backgroundColor = '#f0f0f0';
                    });
                    
                    item.addEventListener('mouseout', () => {
                        item.style.backgroundColor = 'white';
                    });
                    
                    item.addEventListener('click', () => {
                        searchInput.value = product.name;
                        selectedProductId = product.id;
                        dropdownList.style.display = 'none';
                        // 在选择产品后调用showProductSpecs函数加载对应规格
                        showProductSpecs();
                    });
                    
                    dropdownList.appendChild(item);
                });
                
                dropdownList.style.display = filteredProducts.length > 0 ? 'block' : 'none';
            }
            
            searchInput.addEventListener('input', (e) => {
                selectedProductId = ''; // 清空选择的ID
                updateDropdownList(e.target.value);
            });
            
            searchInput.addEventListener('focus', () => {
                updateDropdownList(searchInput.value);
            });
            
            // 点击外部时关闭下拉列表
            document.addEventListener('click', (e) => {
                if (!container.contains(e.target)) {
                    dropdownList.style.display = 'none';
                }
            });
            
            // 设置保质期输入框的默认值为今天的日期加两年
            const expiryDateInput = document.getElementById('incoming-shelf-life');
            const today = new Date();
            const twoYearsLater = new Date(today.setFullYear(today.getFullYear() + 2));
            expiryDateInput.value = twoYearsLater.toISOString().split('T')[0];
        })
        .catch(error => {
            productSelect.innerHTML = '<option value="">加载产品列表失败</option>';
            console.error('Error:', error);
        });
        
    // 添加获取产品ID的方法
    searchInput.getProductId = function() {
        return selectedProductId;
    };
        
    // 添加获取产品ID的方法
    searchInput.getProductId = function() {
        return selectedProductId;
    };
        
    // 重写获取产品ID的方法
    searchInput.getProductId = function() {
        return selectedProductId;
    };
}

// 填充出库产品选择框
function populateOutgoingProductSelect() {
    const outgoingProductSelect = document.getElementById('outgoing-product-select');
    const parentElement = outgoingProductSelect.parentNode;
    
    // 移除原有的select元素
    outgoingProductSelect.remove();
    
    // 创建新的输入框和下拉列表容器
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

    let selectedProductId = '';
    
    apiRequest('/api/products')
        .then(products => {
            const allProducts = products;
            
            function updateDropdownList(filterTerm = '') {
                dropdownList.innerHTML = '';
                const filteredProducts = filterTerm
                    ? allProducts.filter(product =>
                        product.name.toLowerCase().includes(filterTerm.toLowerCase()) ||
                        product.id.toLowerCase().includes(filterTerm.toLowerCase()))
                    : allProducts;
                
                filteredProducts.forEach(product => {
                    const item = document.createElement('div');
                    item.style.padding = '8px';
                    item.style.cursor = 'pointer';
                    item.style.borderBottom = '1px solid #eee';
                    item.textContent = product.name;
                    
                    item.addEventListener('mouseover', () => {
                        item.style.backgroundColor = '#f0f0f0';
                    });
                    
                    item.addEventListener('mouseout', () => {
                        item.style.backgroundColor = 'white';
                    });
                    
                    item.addEventListener('click', () => {
                        searchInput.value = product.name;
                        selectedProductId = product.id;
                        dropdownList.style.display = 'none';
                        // 在选择产品后调用showProductSpecs函数加载对应规格
                        showProductSpecs();
                    });
                    
                    dropdownList.appendChild(item);
                });
                
                dropdownList.style.display = filteredProducts.length > 0 ? 'block' : 'none';
            }
            
            searchInput.addEventListener('input', (e) => {
                selectedProductId = ''; // 清空选择的ID
                updateDropdownList(e.target.value);
            });
            
            searchInput.addEventListener('focus', () => {
                updateDropdownList(searchInput.value);
            });
            
            // 点击外部时关闭下拉列表
            document.addEventListener('click', (e) => {
                if (!container.contains(e.target)) {
                    dropdownList.style.display = 'none';
                }
            });
        })
        .catch(error => {
            productSelect.innerHTML = '<option value="">加载产品列表失败</option>';
            console.error('Error:', error);
        });
        
    // 添加获取产品ID的方法
    searchInput.getProductId = function() {
        return selectedProductId;
    };

}

// 填充记录过滤器
function populateRecordFilters() {
    // 填充产品选择框
    const productFilter = document.getElementById('record-product-filter');
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
        .catch(error => {
            console.error('加载产品列表失败:', error);
        });

    // 填充库位选择框
    const locationFilter = document.getElementById('record-location-filter');
    locationFilter.innerHTML = '<option value="">全部库位</option>';

    // 获取所有库位信息
    apiRequest('/api/stock')
        .then(stocks => {
            // 获取唯一的库位列表
            const locations = [...new Set(stocks.map(stock => stock.location).filter(Boolean))];

            // 对库位进行自然排序（按字母和数字顺序）
            locations.sort((a, b) => {
                // 提取字母部分和数字部分进行比较
                const letterA = a.match(/[A-Za-z]+/)?.[0] || '';
                const letterB = b.match(/[A-Za-z]+/)?.[0] || '';

                // 首先比较字母部分
                if (letterA !== letterB) {
                    return letterA.localeCompare(letterB);
                }

                // 字母相同，比较数字部分
                const numA = parseInt(a.match(/\d+/)?.[0] || '0', 10);
                const numB = parseInt(b.match(/\d+/)?.[0] || '0', 10);
                return numA - numB;
            });

            // 填充下拉选择框
            locations.forEach(location => {
                const option = document.createElement('option');
                option.value = location;
                option.textContent = location;
                locationFilter.appendChild(option);
            });
        })
        .catch(error => {
            console.error('加载库位列表失败:', error);
            alert('加载库位列表失败');
        });

    // 填充操作人选择框
    const operatorFilter = document.getElementById('record-operator-filter');
    operatorFilter.innerHTML = '<option value="">全部操作人</option>'; // Add default option

    apiRequest('/api/records') // Fetch records to get unique operators
        .then(records => {
            // 确保records是数组
            if (!Array.isArray(records)) {
                console.error('返回的records不是数组:', records);
                return;
            }
            const operators = [...new Set(records.map(record => record.operator).filter(Boolean))];
            operators.forEach(operator => {
                const option = document.createElement('option');
                option.value = operator; // Assuming operator is a string
                option.textContent = operator; // Display operator name
                operatorFilter.appendChild(option);
            });
        })
        .catch(error => {
            console.error('加载操作人列表失败:', error);
        });

    // 填充操作原因选择框
    const reasonFilter = document.getElementById('record-reason-filter');
    reasonFilter.innerHTML = '<option value="">全部原因</option>';

    apiRequest('/api/records') // Fetch records to get unique reasons
        .then(records => {
            // 确保records是数组
            if (!Array.isArray(records)) {
                console.error('返回的records不是数组:', records);
                return;
            }
            const reasons = [...new Set(records.map(record => record.reason).filter(Boolean))];
            reasons.forEach(reason => {
                const option = document.createElement('option');
                option.value = reason;
                option.textContent = reason;
                reasonFilter.appendChild(option);
            });
        })
        .catch(error => {
            console.error('加载操作原因列表失败:', error);
        });
}

// 显示记录列表
function displayRecords() {
    const productFilter = document.getElementById('record-product-filter').value;
    const operationFilter = document.getElementById('record-operation-filter').value;
    const locationFilter = document.getElementById('record-location-filter').value;
    const startDateFilter = document.getElementById('record-start-date-filter').value;
    const endDateFilter = document.getElementById('record-end-date-filter').value;
    const reasonFilter = document.getElementById('record-reason-filter').value;
    const operatorFilter = document.getElementById('record-operator-filter').value;
    
    // 如果没有设置日期范围，默认显示近30天的记录
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
                
                // 日期范围过滤
                const recordDate = new Date(record.date);
                recordDate.setHours(0, 0, 0, 0);
                
                let matchDate = true;
                // 如果设置了开始日期，检查记录日期是否大于等于开始日期
                if (startDateFilter) {
                    const startDate = new Date(startDateFilter);
                    startDate.setHours(0, 0, 0, 0);
                    matchDate = matchDate && recordDate >= startDate;
                } else if (defaultStartDate) {
                    // 使用默认的30天前日期
                    matchDate = matchDate && recordDate >= defaultStartDate;
                }
                
                // 如果设置了结束日期，检查记录日期是否小于等于结束日期
                if (endDateFilter) {
                    const endDate = new Date(endDateFilter);
                    endDate.setHours(0, 0, 0, 0);
                    matchDate = matchDate && recordDate <= endDate;
                }
                
                const matchReason = !reasonFilter || record.reason === reasonFilter;
                const matchOperator = !operatorFilter || record.operator === operatorFilter;
                return matchProduct && matchOperation && matchLocation && matchDate && matchReason && matchOperator;
            });

            const recordListBody = document.getElementById('record-list-body');
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
                    <td>
                        <button class="small-button" onclick="openEditRecordModal('${record.id}')">修改</button>
                    </td>
                `;
                recordListBody.appendChild(row);
            });
        })
        .catch(error => {
            console.error('加载记录失败:', error);
            recordList.innerHTML = '<p>加载记录失败</p>';
        });

    // 设置定时刷新，每30秒更新一次数据
}

// 显示库存列表
function showProductRecords(productId, productName) {
    // 获取产品出入库记录
    apiRequest(`/api/records?product_id=${productId}`)
        .then(records => {
            // 过滤记录，只显示当前产品的记录
            records = records.filter(record => record.product_id === productId);
            // 创建弹窗显示记录
            const modal = document.createElement('div');
            modal.style.position = 'fixed';
            modal.style.top = '0';
            modal.style.left = '0';
            modal.style.width = '100%';
            modal.style.height = '100%';
            modal.style.backgroundColor = 'rgba(0,0,0,0.5)';
            modal.style.display = 'flex';
            modal.style.justifyContent = 'center';
            modal.style.alignItems = 'center';
            modal.style.zIndex = '1000';
            
            const modalContent = document.createElement('div');
            modalContent.style.backgroundColor = 'white';
            modalContent.style.padding = '20px';
            modalContent.style.borderRadius = '8px';
            modalContent.style.maxWidth = '80%';
            modalContent.style.maxHeight = '80%';
            modalContent.style.overflow = 'auto';
            
            // 创建关闭按钮
            const closeBtn = document.createElement('button');
            closeBtn.textContent = '关闭';
            closeBtn.style.position = 'absolute';
            closeBtn.style.top = '10px';
            closeBtn.style.right = '10px';
            closeBtn.onclick = () => document.body.removeChild(modal);
            
            // 创建表格显示记录
            const table = document.createElement('table');
            table.style.width = '100%';
            table.style.borderCollapse = 'collapse';
            
            const thead = document.createElement('thead');
            thead.innerHTML = `
                <tr>
                    <th>日期</th>
                    <th>操作类型</th>
                    <th>数量</th>
                    <th>规格</th>
                    <th>批次号</th>
                    <th>库位</th>
                    <th>原因</th>
                </tr>
            `;
            
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
                    <td>${record.reason}</td>
                `;
                tbody.appendChild(tr);
            });
            
            table.appendChild(thead);
            table.appendChild(tbody);
            modalContent.appendChild(table);
            modalContent.appendChild(closeBtn);
            modal.appendChild(modalContent);
            document.body.appendChild(modal);
        })
        .catch(error => {
            console.error('获取记录失败:', error);
            alert('获取记录失败');
        });
}

// 全局变量，用于跟踪断货风险计算逻辑的状态
let includeShenzhenStock = true;

// 切换断货风险计算逻辑
function toggleStockoutCalculation() {
    includeShenzhenStock = !includeShenzhenStock;
    const button = document.getElementById('toggle-stockout-calculation');
    button.textContent = `切换断货风险计算（当前：${includeShenzhenStock ? '深圳+香港' : '仅香港'}）`;
    displayStockList(); // 刷新库存列表以应用新的计算逻辑
}

// 全局变量，用于存储当前排序状态
let currentSortField = 'product_id'; // 默认按产品编号排序
let currentSortDirection = 'asc'; // 默认升序排序

// 排序库存列表的函数
function sortStockList(field) {
    // 如果点击的是当前排序字段，则切换排序方向
    if (field === currentSortField) {
        currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        // 如果点击的是新字段，则设置为该字段升序排序
        currentSortField = field;
        currentSortDirection = 'asc';
    }
    
    // 更新排序指示器
    updateSortIndicators();
    
    // 重新加载库存列表
    displayStockList();
}

// 更新排序指示器
function updateSortIndicators() {
    // 清除所有排序指示器
    document.querySelectorAll('[id^="sort-"]').forEach(span => {
        span.textContent = '';
    });
    
    // 设置当前排序字段的指示器
    const indicator = currentSortDirection === 'asc' ? '↑' : '↓';
    const sortIndicator = document.getElementById(`sort-${currentSortField}`);
    if (sortIndicator) {
        sortIndicator.textContent = indicator;
    }
}

function displayStockList() {
    // 获取产品类别筛选器元素
    const categoryFilter = document.getElementById('stock-category-filter');
    
    // 如果存在类别筛选器，则获取当前选中的类别
    const selectedCategory = categoryFilter ? categoryFilter.value : '';
    
    apiRequest('/api/stock')
        .then(stock => {
            // 收集所有产品类别用于筛选器
            const categories = new Set();
            stock.forEach(item => categories.add(item.category));
            
            // 填充类别筛选下拉框
            if (categoryFilter) {
                categoryFilter.innerHTML = '<option value="">所有类别</option>' + 
                    Array.from(categories).map(cat => 
                        `<option value="${cat}" ${selectedCategory === cat ? 'selected' : ''}>${cat}</option>`
                    ).join('');
            }
            
            // 更新排序指示器
            updateSortIndicators();
            // 按产品ID分组，同时应用类别筛选
            const groupedStock = {};
            stock.forEach(item => {
                // 如果选择了特定类别，则跳过不匹配的类别
                if (selectedCategory && item.category !== selectedCategory) {
                    return;
                }
                if (!groupedStock[item.product_id]) {
                    groupedStock[item.product_id] = {
                        product_id: item.product_id,
                        name: item.name,
                        category: item.category,
                        supplier: item.supplier,
                        unit: item.unit,
                        total_stock: 0, // 初始化总库存
                        in_transit: item.in_transit || 0,
                        daily_consumption: item.daily_consumption || 0,
                        shenzhen_stock: item.shenzhen_stock || 0, // 初始化深圳库存
                        specs: []
                    };
                }

                // 从箱规格中提取数值部分
                let boxQuantity = 0;
                if (item.box_spec) {
                    const match = item.box_spec.match(/^(\d+)/);
                    if (match && match[1]) {
                        boxQuantity = parseInt(match[1]);
                    }
                }

                // 只添加箱数大于0的规格
                if (item.quantity > 0) {
                    groupedStock[item.product_id].specs.push({
                        box_spec: item.box_spec,
                        quantity: item.quantity,
                        expiry_date: item.expiry_date,
                        batch_number: item.batch_number,
                        location: item.location,
                        unit_price: item.unit_price // 添加单价信息
                    });

                    // 计算该规格的总数量（规格数量×箱数）
                    const boxCount = parseInt(item.quantity || 0);
                    const totalItems = boxQuantity * boxCount;

                    // 累加到产品总库存
                    groupedStock[item.product_id].total_stock += totalItems;
                }
            });

            const stockListBody = document.getElementById('stock-list-body');
            stockListBody.innerHTML = '';

            // 将库存数据转换为数组并排序
            let productsArray = Object.values(groupedStock);
            
            // 根据当前排序字段和方向进行排序
            productsArray.sort((a, b) => {
                let valueA, valueB;
                
                if (currentSortField === 'product_id') {
                    // 按产品编号排序
                    valueA = a.product_id;
                    valueB = b.product_id;
                } else if (currentSortField === 'stockout_date') {
                    // 按断货日期排序
                    // 计算断货日期的天数
                    const stockToUseA = includeShenzhenStock ? a.total_stock + a.shenzhen_stock : a.total_stock;
                    const stockToUseB = includeShenzhenStock ? b.total_stock + b.shenzhen_stock : b.total_stock;
                    
                    valueA = a.daily_consumption > 0 ? Math.floor(stockToUseA / a.daily_consumption) : Infinity;
                    valueB = b.daily_consumption > 0 ? Math.floor(stockToUseB / b.daily_consumption) : Infinity;
                } else if (currentSortField === 'expiry_risk') {
                    // 按报废风险排序（最近到期日期的天数）
                    valueA = Infinity;
                    valueB = Infinity;
                    
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    
                    // 寻找A产品最近到期的批次
                    if (a.specs.length > 0) {
                        a.specs.forEach(spec => {
                            if (spec.expiry_date) {
                                const expiryDate = new Date(spec.expiry_date);
                                expiryDate.setHours(0, 0, 0, 0);
                                
                                const timeDiff = expiryDate.getTime() - today.getTime();
                                const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
                                
                                if (daysDiff < valueA) {
                                    valueA = daysDiff;
                                }
                            }
                        });
                    }
                    
                    // 寻找B产品最近到期的批次
                    if (b.specs.length > 0) {
                        b.specs.forEach(spec => {
                            if (spec.expiry_date) {
                                const expiryDate = new Date(spec.expiry_date);
                                expiryDate.setHours(0, 0, 0, 0);
                                
                                const timeDiff = expiryDate.getTime() - today.getTime();
                                const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
                                
                                if (daysDiff < valueB) {
                                    valueB = daysDiff;
                                }
                            }
                        });
                    }
                }
                
                // 根据排序方向确定比较结果
                if (currentSortDirection === 'asc') {
                    return valueA > valueB ? 1 : -1;
                } else {
                    return valueA < valueB ? 1 : -1;
                }
            });
            
            // 渲染排序后的库存列表
            productsArray.forEach(product => {
                // 计算断货日期
                let stockoutDate = '无风险';
                let stockoutRisk = '无风险';
                let riskClass = 'no-risk';

                if (product.daily_consumption > 0) {
                    // 根据当前设置决定是否包含深圳库存
                    const stockToUse = includeShenzhenStock ? 
                        product.total_stock + product.shenzhen_stock : 
                        product.total_stock;
                    
                    // 计算断货日期
                    const daysToStockout = Math.floor(stockToUse / product.daily_consumption);
                    const stockoutDateObj = new Date();
                    stockoutDateObj.setDate(stockoutDateObj.getDate() + daysToStockout);
                    stockoutDate = stockoutDateObj.toLocaleDateString(); // 去掉 'zh-CN'
                    
                    // 计算断货风险（45天阈值）
                    if (daysToStockout < 45) {
                        stockoutRisk = `${daysToStockout}天${includeShenzhenStock ? '' : '(仅香港)'}`;  
                        riskClass = 'high-risk';
                    } else {
                        stockoutRisk = '无风险';
                        riskClass = 'no-risk';
                    }
                }

                // 创建主行
                const mainRow = document.createElement('tr');
                mainRow.classList.add('product-main-row');
                mainRow.setAttribute('data-product-id', product.product_id);

                // 计算报废风险
                let expiryRisk = '无风险';
                let expiryRiskClass = 'no-risk';
                
                // 寻找最近到期的批次
                if (product.specs.length > 0) {
                    let closestExpiryDate = null;
                    let daysToExpiry = Infinity;
                    
                    const today = new Date();
                    today.setHours(0, 0, 0, 0); // 设置为今天的开始时间
                    
                    product.specs.forEach(spec => {
                        if (spec.expiry_date) {
                            const expiryDate = new Date(spec.expiry_date);
                            expiryDate.setHours(0, 0, 0, 0); // 设置为过期日的开始时间
                            
                            const timeDiff = expiryDate.getTime() - today.getTime();
                            const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
                            
                            if (daysDiff < daysToExpiry) {
                                daysToExpiry = daysDiff;
                                closestExpiryDate = expiryDate;
                            }
                        }
                    });
                    
                    if (closestExpiryDate) {
                        if (daysToExpiry < 365) {
                            expiryRisk = `${daysToExpiry}天`;
                            expiryRiskClass = daysToExpiry < 90 ? 'high-risk' : 'medium-risk';
                        }
                    }
                }
                
                mainRow.innerHTML = `
                    <td>${product.product_id}</td>
                    <td onclick="showProductRecords('${product.product_id}')" style="cursor: pointer; text-decoration: underline; color: #0066cc;">${product.name}</td>
                    <td>${product.unit}</td>
                    <td onclick="makeEditable(this)" data-field="in_transit">${product.in_transit}</td>
                    <td onclick="makeEditable(this)" data-field="shenzhen_stock">${product.shenzhen_stock || 0}</td>
                    <td>${product.total_stock}</td> <!-- 显示香港库存（不包含深圳库存） -->
                    <td onclick="makeEditable(this)" data-field="daily_consumption">${product.daily_consumption}</td>
                    <td>${stockoutDate}</td>
                    <td class="${riskClass}">${stockoutRisk}</td>
                    <td class="${expiryRiskClass}">${expiryRisk}</td>
                    <td>
                        <button onclick="toggleSpecRows('${product.product_id}')">查看规格</button>
                    </td>
                `;
                stockListBody.appendChild(mainRow);

                // 创建规格行（默认隐藏）
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
                        <td colspan="2">库位: ${spec.location || '未指定'}</td>
                        <td colspan="1">单价: ${(spec.unit_price !== null && spec.unit_price !== undefined && spec.unit_price !== 0) ? spec.unit_price : '-'}</td>
                    `;
                    stockListBody.appendChild(specRow);
                });
            });
        })
        .catch(error => {
            console.error('加载库存失败:', error);
            stockList.innerHTML = '<tr><td colspan="8">加载库存失败</td></tr>';
        });

}

// 切换规格行的显示/隐藏
function toggleSpecRows(productId) {
    const specRows = document.querySelectorAll(`.spec-${productId}`);
    specRows.forEach(row => {
        row.style.display = row.style.display === 'none' ? 'table-row' : 'none';
    });
}

// 添加自动保存功能
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

        // 保存数据的函数
        const saveData = function() {
            const productId = cell.parentElement.dataset.productId;
            const newValue = input.value;
            const field = cell.dataset.field;

            // 准备更新数据，只包含被修改的字段
            const updateData = {
                product_id: productId
            };
            
            // 根据修改的字段类型添加相应的数据
            if (field === 'in_transit') {
                updateData.in_transit = parseInt(newValue);
            } else if (field === 'daily_consumption') {
                updateData.daily_consumption = parseFloat(newValue);
            } else if (field === 'shenzhen_stock') {
                updateData.shenzhen_stock = parseInt(newValue);
            }

            // 发送更新请求
            fetch('/api/stock/update', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(updateData)
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    cell.textContent = newValue;
                    // 保存成功后刷新页面显示最新的断货日期
                    displayStockList();
                } else {
                    alert('保存失败：' + data.message);
                    cell.textContent = value; // 恢复原值
                }
            })
            .catch(error => {
                console.error('Error:', error);
                alert('保存失败');
                cell.textContent = value; // 恢复原值
            });
        };
        
        // 标记是否已保存的变量
        let isSaved = false;
        
        // 只在按下回车键时保存，不再在失去焦点时自动保存
        input.addEventListener('keydown', function(event) {
            if (event.key === 'Enter') {
                event.preventDefault(); // 阻止默认的回车键行为
                isSaved = true; // 标记为已保存
                saveData(); // 调用保存函数
                input.blur(); // 让输入框失去焦点
            }
        });
        
        // 当输入框失去焦点但没有按回车键时，恢复原值
        input.addEventListener('blur', function() {
            if (!isSaved && cell.contains(input)) {
                cell.textContent = value; // 恢复原值
            }
        });
    }
}

// 添加待出库列表数组
let outgoingList = [];

// 从localStorage加载待出库列表
function loadOutgoingListFromStorage() {
    // 获取当前商户ID
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
    // 获取当前商户ID
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

// 修改显示产品规格的函数
function showProductSpecs() {
    const outgoingProductSelect = document.getElementById('outgoing-product-select');
    const boxSpecSelect = document.getElementById('outgoing-box-spec');
    // 使用getProductId方法获取产品ID，如果该方法存在
    const productId = outgoingProductSelect.getProductId ? outgoingProductSelect.getProductId() : outgoingProductSelect.value;

    boxSpecSelect.innerHTML = '<option value="">请选择规格</option>';

    if (productId) {
        fetch('/api/stock')
        .then(response => response.json())
        .then(stock => {
            // 过滤掉库存为0的规格，并按过期日期排序
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

    // 创建工作簿和工作表
    const wb = XLSX.utils.book_new();
    const wsData = [[ '品名', '库位', '规格', '数量', '批次号', '过期日期', '确认提货（勾选已提货项目）']]; // 添加批次号列

    const currentMerchant = document.getElementById('current-merchant-name').textContent;
    const deliveryDate = new Date().toLocaleDateString();
    
    // 计算总提货箱数
    const totalBoxes = outgoingList.reduce((sum, item) => sum + item.quantity, 0);

    outgoingList.forEach(item => {
        wsData.push([
            item.product_name,
            item.location || '未指定',
            item.box_spec,
            item.quantity,
            item.batch_number || '无', // 添加批次号
            item.expiry_date,
            ''
        ]);
    });
    wsData.push(['', '', '', '', '', '']); // First empty row
    wsData.push(['商户名称',currentMerchant, '提货日期',deliveryDate]);
    wsData.push(['', '', '', '', '', '']); // First empty row
    wsData.push(['总提货箱数', totalBoxes, '', '核对提货', '共计', '        箱']); // 新增总提货箱数行
    wsData.push(['', '', '', '', '', '']); // First empty row
    wsData.push(['', '', '', '', '', '']); // First empty row
    wsData.push(['提货人签字: __________   复核人签字: __________']); // Signature line

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, '提货单');

    // 导出 Excel 文件
    XLSX.writeFile(wb, `提货单_${new Date().toISOString().slice(0,10)}.xlsx`);
}

// 出库确认函数，处理批量出库操作，包括库存检查和更新
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

            // 在这里调用更新函数
            updateOutgoingListDisplay(); // 确保调用正确的更新函数

            alert(successMessage);
            outgoingList = []; // 清空待出库列表
            updateOutgoingListDisplay(); // 更新显示
        })
        .catch(error => {
            console.error('Error:', error);
            alert('出库操作失败: ' + error.message);
        });
}

// 处理API错误的函数
function handleApiError(error, operation) {
    console.error(`${operation} error:`, error);
    
    // 检查是否是401未授权错误(可能是会话过期)
    if (error.status === 401) {
        silentLogout();
        return;
    }
    
    alert(`${operation}失败: ${error.message || '未知错误'}`);
}

// API请求函数，处理与后端的所有通信
function apiRequest(url, method = 'GET', data = null) {
    const options = {
        method: method,
        headers: {
            'Content-Type': 'application/json',
        },
        credentials: 'same-origin'
    };

    if (data) {
        options.body = JSON.stringify(data);
    }

    return fetch(url, options)
        .then(response => {
            if (response.ok) {
                return response.json();
            }
            
            // 如果是401错误，可能是会话过期
            if (response.status === 401) {
                // 先尝试解析响应内容
                return response.json().then(errorData => {
                    // 检查是否是会话过期
                    if (errorData.expired) {
                        silentLogout();
                        throw new Error('会话已过期');
                    }
                    // 其他401错误
                    throw new Error(errorData.message || '认证失败');
                }).catch(e => {
                    // 如果无法解析JSON，也判定为会话过期
                    silentLogout();
                    throw new Error('会话已过期');
                });
            }
            
            throw new Error('网络请求失败: ' + response.statusText);
        })
        .catch(error => {
            // 如果不是会话过期的错误，记录并重新抛出
            if (error.message !== '会话已过期') {
                console.error('API请求错误:', error);
            }
            throw error;
        });
}

// 修改添加到待出库列表的函数，确保库位信息被包含
function addToOutgoingList() {
    const productSelect = document.getElementById('outgoing-product-select');
    const boxSpecSelect = document.getElementById('outgoing-box-spec');
    const quantityInput = document.getElementById('outgoing-quantity');
    const outgoingReason = document.getElementById('outgoing-reason').value;
    const productId = productSelect.getProductId ? productSelect.getProductId() : productSelect.value;
    const productName = productSelect.value || '未知产品';
    const boxSpec = boxSpecSelect.value;
    const quantity = parseInt(quantityInput.value);
    // 安全地获取location数据，避免在没有选择选项时出错
    const location = boxSpecSelect.selectedIndex >= 0 ? boxSpecSelect.options[boxSpecSelect.selectedIndex].dataset.location : '';

    // 基本验证
    if (!productId || !boxSpec || !quantity || !outgoingReason) {
        alert('请填写完整信息');
        return;
    }

    // 获取当前库存信息
    fetch('/api/stock')
        .then(response => response.json())
        .then(stock => {
            // 打印库存信息以进行调试
            console.log('所有库存:', stock);
            
            // 获取用户选择的过期日期
            const selectedExpiryDate = boxSpecSelect.selectedIndex >= 0 ? boxSpecSelect.options[boxSpecSelect.selectedIndex].dataset.expiryDate : '';
            console.log('用户选择的过期日期:', selectedExpiryDate);
            
            // 首先查找完全匹配的记录（包括过期日期）并且库存数量大于0的记录
            let currentStock = stock.find(s =>
                s.product_id === productId &&
                s.box_spec === boxSpec &&
                s.location === location &&
                s.expiry_date === selectedExpiryDate &&
                s.quantity > 0
            );
            
            console.log('精确匹配且有库存的记录:', currentStock);
            
            // 如果找不到有库存的精确匹配记录，不再尝试放宽条件
            // 直接提示用户选择的库存不存在或已售罄
            if (!currentStock) {
                alert('您选择的库存（包括过期日期）不存在或已售罄，请重新选择');
                return;
            }
            
            // 如果仍然找不到库存记录
            if (!currentStock) {
                alert('无法找到有效的库存记录，可能库存已售罄');
                return;
            }

            if (quantity > currentStock.quantity) {
                alert('出库数量不能大于库存数量');
                return;
            }

            // 检查是否已在列表中
            const existingItem = outgoingList.find(item =>
                item.product_id === productId &&
                item.box_spec === boxSpec &&
                item.location === currentStock.location
            );

            if (existingItem) {
                alert('该产品规格已在待出库列表中');
                return;
            }

            // 添加到待出库列表
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

            // 更新待出库列表显示并保存到localStorage
            updateOutgoingListDisplay();
            saveOutgoingListToStorage();

            // 清空输入
            quantityInput.value = '';
            boxSpecSelect.value = '';
            productSelect.value = '';
            document.getElementById('outgoing-reason').value = '生产'; // 重置为默认值
        })
        .catch(error => {
            console.error('Error:', error);
            alert('添加到待出库列表失败: ' + error.message);
        });
}

// 修改 confirmOutgoing 函数，确保出库原因被传递到后端
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
                // 清除localStorage中的数据
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
                displayStockList(); // 添加库存列表更新
                displayRecords(); // 更新出入库记录表
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

// 页面加载完成后显示欢迎动画
document.addEventListener('DOMContentLoaded', function() {
    const welcomeScreen = document.getElementById('welcomeScreen');
    welcomeScreen.classList.remove('hide');

    // 0.5秒后隐藏欢迎动画
    setTimeout(() => {
        welcomeScreen.classList.add('hide');
    }, 500);
});

// 页面加载完成后执行初始化
document.addEventListener('DOMContentLoaded', function() {
    // 获取当前用户信息
    getCurrentUser();

    // 加载商户列表
    loadMerchants();

    // 加载产品列表
    loadProducts();

    // 填充入库产品选择框
    populateIncomingProductSelect();

    // 填充出库产品选择框
    populateOutgoingProductSelect();

    // 移除以下数据的初始加载，改为按需加载：
    // - displayStockList(); // 库存页面数据
    // - displayRecords(); // 出入库记录数据
    // - populateRecordFilters(); // 记录过滤器
    // - loadLocations(); // 库位列表
    // - populateRelocationProductSelect(); // 移位产品选择框

    // 初始化新增用户表单的权限列表
    loadPermissions('new-user-permissions');
});

// 获取当前用户信息并更新界面
function getCurrentUser() {
    return fetch('/api/users/current')
        .then(response => {
            if (!response.ok) {
                throw new Error('网络响应不正常');
            }
            return response.json();
        })
        .then(user => {
            // 显示用户名
            document.getElementById('current-username').textContent = user.username;

            // 根据用户权限显示/隐藏导航按钮
            updateNavigation(user.permissions, user.is_admin);
            return user; // 确保返回用户数据
        })
        .catch(error => {
            console.error('Error:', error);
            alert('获取用户信息失败: ' + error.message);
            return null; // 返回 null 以确保 Promise 始终有返回值
        });
}

// 根据用户权限更新导航按钮显示
function updateNavigation(permissions, isAdmin) {
    // 如果是管理员，显示所有按钮
    if (isAdmin) {
        return;
    }

    // 权限与导航按钮的映射关系
    const permissionMap = {
        'product_manage': 'nav-product',
        'incoming_operate': 'nav-incoming',
        'outgoing_operate': 'nav-outgoing',
        'records_view': 'nav-records',
        'stock_view': 'nav-stock',
        'user_manage': 'user',
        'location_query': 'nav-location'  // 新增库位查询权限映射
    };

    // 遍历所有导航按钮，根据权限显示/隐藏
    for (const [permission, navId] of Object.entries(permissionMap)) {
        const navButton = document.getElementById(navId);
        if (navButton) {
            // 只控制左侧导航栏的显示，不影响功能使用
            navButton.style.display = permissions.includes(permission) ? 'block' : 'none';
        }
    }

    // 商户管理按钮只对管理员显示
    const merchantButton = document.getElementById('nav-merchant');
    if (merchantButton) {
        merchantButton.style.display = 'none';
    }

    // 用户管理按钮只对有user_manage权限的用户显示
    const userManageButton = document.querySelector('.user-info button:first-of-type');
    if (userManageButton) {
        userManageButton.style.display = permissions.includes('user_manage') ? 'inline-block' : 'none';
    }


}

// 退出登录
function logout() {
    fetch('/logout')
        .then(response => {
            window.location.href = '/login';
        })
        .catch(error => {
            console.error('Logout error:', error);
            alert('退出登录失败: ' + error.message);
        });
}

// 加载用户列表
function loadUsers() {
    fetch('/api/users')
    .then(response => response.json())
    .then(users => {
        const tbody = document.getElementById('user-list-body');
        tbody.innerHTML = '';

        users.forEach(user => {
            const row = document.createElement('tr');

            // 格式化权限显示
            const permissionsText = user.permissions.map(p => p.description).join(', ');

            row.innerHTML = `
                <td>${user.id}</td>
                <td>${user.username}</td>
                <td>${user.is_admin ? '是' : '否'}</td>
                <td>${user.last_login || '从未登录'}</td>
                <td>${permissionsText}</td>
                <td>
                    <button onclick="editUserPermissions(${user.id})">编辑权限</button>
                    <button onclick="deleteUser(${user.id})">删除</button>
                </td>
            `;

            tbody.appendChild(row);
        });
    })
    .catch(error => {
        console.error('Error:', error);
        alert('加载用户列表失败: ' + error.message);
    });
}

// 编辑用户权限
function editUserPermissions(userId) {
    // 获取用户信息
    fetch(`/api/users`)
    .then(response => response.json())
    .then(users => {
        // 找到指定用户
        const user = users.find(u => u.id === userId);
        if (!user) {
            alert('找不到指定用户');
            return;
        }
        
        // 设置表单值
        document.getElementById('edit-user-is-admin').checked = user.is_admin;
        document.getElementById('edit-user-id').value = user.id;
        
        // 加载权限复选框并选中用户已有的权限
        loadPermissions('edit-user-permissions', user.permissions);
        
        // 显示模态框
        document.getElementById('edit-permissions-modal').style.display = 'block';
    })
    .catch(error => {
        console.error('Error:', error);
        alert('获取用户信息失败: ' + error.message);
    });
}

// 更新用户权限
function updateUserPermissions() {
    const userId = document.getElementById('edit-user-id').value;
    const isAdmin = document.getElementById('edit-user-is-admin').checked;
    const permissions = getSelectedPermissions('edit-user-permissions');

    const data = {
        is_admin: isAdmin,
        permissions: permissions
    };

    fetch(`/api/users/${userId}/permissions`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
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
        alert(data.message);
        // 关闭模态框
        document.getElementById('edit-permissions-modal').style.display = 'none';
        // 重新加载用户列表
        loadUsers();
    })
    .catch(error => {
        console.error('Error:', error);
        alert('更新用户权限失败: ' + error.message);
    });
}

// 加载权限列表
function loadPermissions(containerId, selectedPermissions = []) {
    fetch('/api/permissions')
    .then(response => response.json())
    .then(permissions => {
        const container = document.getElementById(containerId);
        container.innerHTML = '';

        permissions.forEach(permission => {
            const isChecked = selectedPermissions.some(p => p.id === permission.id);

            const div = document.createElement('div');
            div.className = 'permission-item';
            div.innerHTML = `
                <input type="checkbox" id="${containerId}-${permission.id}" value="${permission.id}" ${isChecked ? 'checked' : ''}>
                <label for="${containerId}-${permission.id}">${permission.description}</label>
            `;

            container.appendChild(div);
        });
    })
    .catch(error => {
        console.error('Error:', error);
        alert('加载权限列表失败: ' + error.message);
    });
}

// 获取选中的权限ID
function getSelectedPermissions(containerId) {
    const container = document.getElementById(containerId);
    const checkboxes = container.querySelectorAll('input[type="checkbox"]:checked');
    return Array.from(checkboxes).map(cb => parseInt(cb.value));
}

// 添加新用户
function addUser() {
    const username = document.getElementById('new-user-username').value;
    const password = document.getElementById('new-user-password').value;
    const isAdmin = document.getElementById('new-user-is-admin').checked;
    const permissions = getSelectedPermissions('new-user-permissions');

    if (!username || !password) {
        alert('请填写用户名和密码');
        return;
    }

    const userData = {
        username,
        password,
        is_admin: isAdmin,
        permissions
    };

    fetch('/api/users', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(userData)
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
        alert(data.message);
        // 清空输入框
        document.getElementById('new-user-username').value = '';
        document.getElementById('new-user-password').value = '';
        document.getElementById('new-user-is-admin').checked = false;
        // 重新加载用户列表
        loadUsers();
    })
    .catch(error => {
        console.error('Error:', error);
        alert('添加用户失败: ' + error.message);
    });
}

// 删除用户
function deleteUser(userId) {
    if (!confirm('确定要删除此用户吗？此操作不可撤销。')) {
        return;
    }

    fetch(`/api/users/${userId}`, {
        method: 'DELETE'
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
        alert(data.message);
        // 重新加载用户列表
        loadUsers();
    })
    .catch(error => {
        console.error('Error:', error);
        alert('删除用户失败: ' + error.message);
    });
}

// 添加新商户
function addMerchant() {
    const nameInput = document.getElementById('new-merchant-name');
    const name = nameInput.value.trim();

    if (!name) {
        alert('请输入商户名称');
        return;
    }

    apiRequest('/api/merchants', 'POST', { name: name })
        .then(response => {
            if (response.success) {
                alert('商户添加成功');
                nameInput.value = '';

                // 重新加载商户列表
                loadMerchants();
            } else {
                alert(response.message || '添加商户失败');
            }
        })
        .catch(error => {
            console.error('添加商户失败:', error);
            alert('添加商户失败');
        });
}

// 添加删除产品确认函数
function confirmDeleteProduct(productId, productName) {
    const confirmDialog = document.createElement('div');
    confirmDialog.className = 'confirm-dialog';
    confirmDialog.innerHTML = `
        <div class="confirm-content">
            <h3>警告！</h3>
            <p>删除产品将同时删除该产品的所有库存记录。此操作不可恢复！</p>
            <p>请输入"删除"以确认：</p>
            <input type="text" id="delete-confirmation" />
            <div class="confirm-buttons">
                <button onclick="deleteProduct('${productId}')">确认</button>
                <button onclick="this.parentElement.parentElement.parentElement.remove()">取消</button>
            </div>
        </div>
    `;
    document.body.appendChild(confirmDialog);
}

// 添加删除产品函数
function deleteProduct(productId) {
    const confirmInput = document.getElementById('delete-confirmation');
    if (confirmInput.value !== '删除') {
        alert('请输入"删除"以确认操作');
        return;
    }

    fetch(`/api/products/${productId}`, {
        method: 'DELETE'
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            alert('产品删除成功');
            displayProductList();
        } else {
            alert('删除失败: ' + data.message);
        }
        document.querySelector('.confirm-dialog').remove();
    })
    .catch(error => {
        console.error('Error:', error);
        alert('删除失败: ' + error.message);
    });
}

// 添加删除商户确认函数
function confirmDeleteMerchant(merchantId, merchantName) {
    const confirmDialog = document.createElement('div');
    confirmDialog.className = 'confirm-dialog';
    confirmDialog.innerHTML = `
        <div class="confirm-content">
            <h3>警告！</h3>
            <p>删除商户将同时删除该商户的所有相关数据，包括产品、库存和操作记录。此操作不可恢复！</p>
            <p>请输入"删除"以确认：</p>
            <input type="text" id="delete-merchant-confirmation" />
            <div class="confirm-buttons">
                <button onclick="deleteMerchant(${merchantId})">确认</button>
                <button onclick="this.parentElement.parentElement.parentElement.remove()">取消</button>
            </div>
        </div>
    `;
    document.body.appendChild(confirmDialog);
}

// 添加删除商户函数
function deleteMerchant(merchantId) {
    const confirmInput = document.getElementById('delete-merchant-confirmation');
    if (confirmInput.value !== '删除') {
        alert('请输入"删除"以确认操作');
        return;
    }

    fetch(`/api/merchants/${merchantId}`, {
        method: 'DELETE'
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            alert('商户删除成功');
            loadMerchants(); // 重新加载商户列表
        } else {
            alert('删除失败: ' + data.message);
        }
        document.querySelector('.confirm-dialog').remove();
    })
    .catch(error => {
        console.error('删除商户失败:', error);
        alert('删除失败');
    });
}

// Excel导出函数，将当前库存数据导出为Excel文件，支持数据过滤
function exportStockToExcel() {
    apiRequest('/api/stock')
        .then(stockItems => {
            const headers = ['产品编号', '品名', '产品类别', '供应商', '产品单位', '香港库存', '深圳库存', '在途数量', '每日消耗', '规格', '库位', '批次号', '过期日期', '单价'];
            const filteredStockItems = stockItems.filter(item => item.quantity > 0);

            const wsData = [
                headers,
                ...filteredStockItems.map(item => [
                    item.product_id,
                    item.name,
                    item.category,
                    item.supplier,
                    item.unit,
                    item.quantity,
                    item.shenzhen_stock || 0,
                    item.in_transit || 0,
                    item.daily_consumption || 0,
                    item.box_spec,
                    item.location,
                    item.batch_number || '',
                    item.expiry_date || '',
                    item.unit_price || '',
                ])
            ];

            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.aoa_to_sheet(wsData);
            XLSX.utils.book_append_sheet(wb, ws, '库存');
            XLSX.writeFile(wb, '库存盘点.xlsx');
        })
        .catch(error => alert('导出库存失败: ' + error.message));
}

// 批量上传Excel修改每日消耗
function uploadDailyConsumptionExcel() {
    // 创建一个隐藏的文件输入元素
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.xlsx, .xls';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);
    
    // 触发文件选择对话框
    fileInput.click();
    
    // 监听文件选择事件
    fileInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (!file) {
            document.body.removeChild(fileInput);
            return;
        }
        
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, {type: 'array'});
                
                // 获取第一个工作表
                const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                
                // 将工作表转换为JSON
                const jsonData = XLSX.utils.sheet_to_json(worksheet);
                
                if (jsonData.length === 0) {
                    alert('Excel文件为空');
                    document.body.removeChild(fileInput);
                    return;
                }
                
                // 检查Excel文件是否包含必要的列
                const firstRow = jsonData[0];
                if (!('产品编号' in firstRow) || !('每日消耗' in firstRow)) {
                    alert('Excel文件格式不正确，必须包含"产品编号"和"每日消耗"列');
                    document.body.removeChild(fileInput);
                    return;
                }
                
                // 准备更新数据
                const updatePromises = [];
                
                jsonData.forEach(row => {
                    const productId = row['产品编号'];
                    const dailyConsumption = parseFloat(row['每日消耗']) || 0;
                    
                    if (productId) {
                        // 创建更新请求，只发送每日消耗数据
                        const updatePromise = fetch('/api/stock/update', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                product_id: productId,
                                daily_consumption: dailyConsumption
                            })
                        }).then(response => response.json());
                        
                        updatePromises.push(updatePromise);
                    }
                });
                
                // 处理所有更新请求
                Promise.all(updatePromises)
                    .then(results => {
                        const successCount = results.filter(result => result.success).length;
                        alert(`批量更新成功，共更新${successCount}条记录`);
                        // 更新库存列表显示
                        displayStockList();
                    })
                    .catch(error => {
                        console.error('批量更新失败:', error);
                        alert('批量更新失败: ' + error.message);
                    });
            } catch (error) {
                console.error('处理Excel文件失败:', error);
                alert('处理Excel文件失败: ' + error.message);
            } finally {
                document.body.removeChild(fileInput);
            }
        };
        
        reader.onerror = function() {
            alert('读取文件失败');
            document.body.removeChild(fileInput);
        };
        
        reader.readAsArrayBuffer(file);
    });
}

// 导出所有商户库存数据到Excel文件
function exportAllMerchantsStockToExcel() {
    apiRequest('/api/all-merchants-stock')
        .then(stockItems => {
            const headers = ['商户名称', '产品编号', '品名', '产品类别', '供应商', '产品单位', '香港库存', '深圳库存', '规格', '库位', '批次号', '过期日期', '单价'];
            const filteredStockItems = stockItems.filter(item => item.quantity > 0);

            const wsData = [
                headers,
                ...filteredStockItems.map(item => [
                    item.merchant_name,
                    item.product_id,
                    item.name,
                    item.category,
                    item.supplier,
                    item.unit,
                    item.quantity,
                    item.shenzhen_stock || 0,
                    item.box_spec,
                    item.location,
                    item.batch_number || '',
                    item.expiry_date || '',
                    item.unit_price || '',
                ])
            ];

            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.aoa_to_sheet(wsData);
            XLSX.utils.book_append_sheet(wb, ws, '所有商户库存');
            XLSX.writeFile(wb, '所有商户库存盘点.xlsx');
        })
        .catch(error => alert('导出所有商户库存失败: ' + error.message));
}

// 加载商户列表函数，从后端获取商户数据并更新商户选择器
function loadMerchants() {
    // 获取商户下拉菜单元素和商户列表元素
    const merchantDropdown = document.getElementById('merchant-dropdown');
    const currentMerchantName = document.getElementById('current-merchant-name');
    const merchantListBody = document.getElementById('merchant-list-body');

    // 清空下拉菜单和商户列表
    merchantDropdown.innerHTML = '';
    merchantListBody.innerHTML = '';

    // 从API获取商户列表
    apiRequest('/api/merchants')
        .then(merchants => {
            // 更新商户列表表格
            merchants.forEach(merchant => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${merchant.id}</td>
                    <td>${merchant.name}</td>
                    <td>${new Date(merchant.created_at).toLocaleString()}</td>
                    <td>
                        <button onclick="switchMerchant(${merchant.id})">切换到此商户</button>
                        <button onclick="confirmDeleteMerchant(${merchant.id}, '${merchant.name}')">删除</button>
                    </td>
                `;
                merchantListBody.appendChild(row);
            });

            // 获取当前商户信息
            apiRequest('/api/merchants/current')
                .then(response => {
                    if (response.success) {
                        const currentMerchant = response.merchant;
                        currentMerchantName.textContent = currentMerchant.name;

                        // 填充商户下拉菜单
                        merchants.forEach(merchant => {
                            const merchantItem = document.createElement('div');
                            merchantItem.className = 'merchant-item';
                            if (merchant.id === currentMerchant.id) {
                                merchantItem.classList.add('active');
                            }
                            merchantItem.textContent = merchant.name;
                            merchantItem.setAttribute('data-id', merchant.id);
                            merchantItem.onclick = function() {
                                switchMerchant(merchant.id);
                            };
                            merchantDropdown.appendChild(merchantItem);
                        });

                        // 添加商户下拉菜单的点击事件
                        document.getElementById('current-merchant').onclick = function() {
                            merchantDropdown.classList.toggle('show');
                            const dropdownIcon = document.querySelector('.dropdown-icon');
                            dropdownIcon.style.transform = merchantDropdown.classList.contains('show') ? 'rotate(180deg)' : '';
                        };
                    } else {
                        currentMerchantName.textContent = '未选择商户';
                    }
                })
                .catch(error => {
                    console.error('获取当前商户失败:', error);
                    currentMerchantName.textContent = '加载失败';
                });
        })
        .catch(error => {
            console.error('加载商户列表失败:', error);
        });
}

// 切换当前商户
function switchMerchant(merchantId) {
    apiRequest('/api/merchants/switch', 'POST', { merchant_id: merchantId })
        .then(response => {
            if (response.success) {
                // 重新加载页面以更新所有数据
                window.location.reload();
            } else {
                alert(response.message || '切换商户失败');
            }
        })
        .catch(error => {
            console.error('切换商户失败:', error);
            alert('切换商户失败');
        });
}

// 加载产品列表函数，从后端获取产品数据
function loadProducts() {
    // 使用已有的displayProductList函数来加载产品
    displayProductList();
}

// 重置记录筛选条件
function resetRecordFilters() {
    document.getElementById('record-product-filter').value = '';
    document.getElementById('record-operation-filter').value = '';
    document.getElementById('record-location-filter').value = '';
    document.getElementById('record-start-date-filter').value = '';
    document.getElementById('record-end-date-filter').value = '';
    document.getElementById('record-reason-filter').value = ''; // Reset operation reason
    document.getElementById('record-operator-filter').value = ''; // Reset operator

    // 重新加载记录
    displayRecords();
}

// 页面加载完成后的初始化函数
document.addEventListener('DOMContentLoaded', function() {
    // 隐藏所有标签页
    const tabs = document.querySelectorAll('.tab-content');
    tabs.forEach(tab => {
        tab.style.display = 'none';
    });

    // 默认显示入库操作标签页
    const defaultTab = document.getElementById('incoming');
    if (defaultTab) {
        defaultTab.style.display = 'block';
    }
    


});

// 加载库位列表 - 在页面加载时初始化库位选择器
function loadLocations() {
    const locationSelect = document.getElementById('location-select');
    locationSelect.innerHTML = '<option value="">请选择库位</option>';
    
    // 获取当前选择的查询范围
    const isAllMerchants = document.getElementById('all-merchants').checked;
    
    // 如果是单商户模式，确保已获取当前商户信息
    if (!isAllMerchants) {
        getCurrentMerchant();
    }
    
    // 根据选择的范围决定使用哪个API获取库存
    const apiUrl = isAllMerchants ? '/api/all-merchants-stock' : '/api/stock';

    // 获取库存信息以提取唯一的库位列表
    apiRequest(apiUrl)
        .then(stocks => {
            // 获取唯一的库位列表，排除数量为0的库位
            const locations = [...new Set(stocks.filter(stock => stock.quantity > 0).map(stock => stock.location).filter(Boolean))];

            // 对库位进行自然排序（按字母和数字顺序）
            locations.sort((a, b) => {
                // 提取字母部分和数字部分进行比较
                const letterA = a.match(/[A-Za-z]+/)?.[0] || '';
                const letterB = b.match(/[A-Za-z]+/)?.[0] || '';

                // 首先比较字母部分
                if (letterA !== letterB) {
                    return letterA.localeCompare(letterB);
                }

                // 字母相同，比较数字部分
                const numA = parseInt(a.match(/\d+/)?.[0] || '0', 10);
                const numB = parseInt(b.match(/\d+/)?.[0] || '0', 10);
                return numA - numB;
            });

            // 填充库位选择器
            locations.forEach(location => {
                const option = document.createElement('option');
                option.value = location;
                option.textContent = location;
                locationSelect.appendChild(option);
            });
        })
        .catch(error => {
            console.error('加载库位列表失败:', error);
            alert('加载库位列表失败');
        });
}

// 根据选择的库位获取产品信息
function fetchProductsByLocation() {
    const locationSelect = document.getElementById('location-select');
    const selectedLocation = locationSelect.value;
    const locationProductsBody = document.getElementById('location-products-body');
    
    // 获取当前选择的查询范围
    const isAllMerchants = document.getElementById('all-merchants').checked;

    // 清空当前表格内容
    locationProductsBody.innerHTML = '';

    if (!selectedLocation) {
        return; // 如果没有选择库位，则不执行任何操作
    }

    // 根据选择的范围决定使用哪个API获取库存
    const apiUrl = isAllMerchants ? '/api/all-merchants-stock' : '/api/stock';

    // 获取库存信息并筛选出所选库位的产品
    apiRequest(apiUrl)
        .then(stocks => {
            // 筛选指定库位的产品，排除数量为0的产品
            const filteredStocks = stocks.filter(stock => stock.location === selectedLocation && stock.quantity > 0);

            if (filteredStocks.length === 0) {
                // 如果没有找到产品，显示提示信息
                const emptyRow = document.createElement('tr');
                emptyRow.innerHTML = `<td colspan="6" style="text-align: center;">该库位没有产品</td>`;
                locationProductsBody.appendChild(emptyRow);
                return;
            }

            // 为每个产品创建表格行
            filteredStocks.forEach(stock => {
                const row = document.createElement('tr');
                // 如果是所有商户模式，显示商户名称
                const merchantName = isAllMerchants ? stock.merchant_name : '';
                
                row.innerHTML = `
                    <td>${stock.product_id}</td>
                    <td>${stock.name}</td>
                    <td>${isAllMerchants ? merchantName : current_merchant.name}</td>
                    <td>${stock.box_spec}</td>
                    <td>${stock.quantity}</td>
                    <td>${stock.expiry_date ? new Date(stock.expiry_date).toLocaleDateString() : '无'}</td>
                    <td>${stock.batch_number || '无'}</td>
                `;
                locationProductsBody.appendChild(row);
            });
        })
        .catch(error => {
            console.error('获取库位产品失败:', error);
            alert('获取库位产品失败');
        });
}

// Example of converting a date string to Beijing Time in JavaScript
function convertToBeijingTime(dateString) {
    // 直接使用后端返回的北京时间字符串进行格式化
    return new Date(dateString).toLocaleString();
}

// 添加会话检查函数
function checkSession() {
    fetch('/api/check-session')
    .then(response => response.json())
    .then(data => {
        if (!data.success && data.expired) {
            // 如果会话过期，静默登出
            silentLogout();
        }
    })
    .catch(error => {
        console.error('Session check error:', error);
        // 如果无法检查会话(比如网络错误)，为安全起见也登出
        silentLogout();
    });
}

// 静默登出函数，不显示提示
function silentLogout() {
    fetch('/logout')
        .then(() => {
            window.location.href = '/login';
        })
        .catch(error => {
            console.error('Logout error:', error);
            window.location.href = '/login'; // 即使出错也重定向到登录页
        });
}

// 设置定时器，每5分钟检查一次会话状态
setInterval(checkSession, 300000);

// 添加页面加载时的会话检查
document.addEventListener('DOMContentLoaded', function() {
    // 立即检查会话状态
    checkSession();
    
    // 其他DOMContentLoaded事件处理...
});











// 导出记录到Excel的函数
function exportRecordsToExcel() {
    const productFilter = document.getElementById('record-product-filter').value;
    const operationFilter = document.getElementById('record-operation-filter').value;
    const locationFilter = document.getElementById('record-location-filter').value;
    const startDateFilter = document.getElementById('record-start-date-filter').value;
    const endDateFilter = document.getElementById('record-end-date-filter').value;
    const reasonFilter = document.getElementById('record-reason-filter').value;
    const operatorFilter = document.getElementById('record-operator-filter').value;

    // 如果没有设置日期范围，默认显示近30天的记录
    let defaultStartDate = null;
    if (!startDateFilter && !endDateFilter) {
        defaultStartDate = new Date();
        defaultStartDate.setDate(defaultStartDate.getDate() - 30);
        defaultStartDate.setHours(0, 0, 0, 0);
    }

    apiRequest('/api/records')
        .then(records => {
            // 根据筛选条件过滤记录
            const filteredRecords = records.filter(record => {
                const matchProduct = !productFilter || record.product_id === productFilter;
                const matchOperation = !operationFilter || record.operation_type === operationFilter;
                const matchLocation = !locationFilter || record.location === locationFilter;
                
                // 日期范围过滤
                const recordDate = new Date(record.date);
                recordDate.setHours(0, 0, 0, 0);
                
                let matchDate = true;
                // 如果设置了开始日期，检查记录日期是否大于等于开始日期
                if (startDateFilter) {
                    const startDate = new Date(startDateFilter);
                    startDate.setHours(0, 0, 0, 0);
                    matchDate = matchDate && recordDate >= startDate;
                } else if (defaultStartDate) {
                    // 使用默认的30天前日期
                    matchDate = matchDate && recordDate >= defaultStartDate;
                }
                
                // 如果设置了结束日期，检查记录日期是否小于等于结束日期
                if (endDateFilter) {
                    const endDate = new Date(endDateFilter);
                    endDate.setHours(0, 0, 0, 0);
                    matchDate = matchDate && recordDate <= endDate;
                }
                
                const matchReason = !reasonFilter || record.reason === reasonFilter;
                const matchOperator = !operatorFilter || record.operator === operatorFilter;
                return matchProduct && matchOperation && matchLocation && matchDate && matchReason && matchOperator;
            });

            // 设置表头
            const headers = ['日期', '品名', '操作类型', '库位', '数量', '规格', '总数', '批次号', '单价', '过期日期', '操作原因', '操作人'];
            const wsData = [
                headers,
                ...filteredRecords.map(record => [
                    record.date,
                    record.product_name,
                    record.operation_type,
                    record.location,
                    record.quantity,
                    record.box_spec,
                    record.total || 0, // 确保总数列
                    record.batch_number || '-', // 确保批次号列
                    record.unit_price !== null ? record.unit_price : '-', // 确保单价列
                    record.expiry_date ? new Date(record.expiry_date).toLocaleDateString() : '-', // 确保过期日期列
                    record.reason || '-', // 确保操作原因列
                    record.operator || '未知' // 确保操作人列
                ])
            ];

            // 创建工作簿和工作表
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.aoa_to_sheet(wsData);
            XLSX.utils.book_append_sheet(wb, ws, '出入库记录');

            // 导出 Excel 文件
            XLSX.writeFile(wb, `出入库记录_${new Date().toISOString().slice(0, 10)}.xlsx`);
        })
        .catch(error => {
            console.error('导出记录失败:', error);
            alert('导出记录失败');
        });
}



// 移位操作相关全局变量
let relocationList = [];

// 加载移位产品选择列表
function populateRelocationProductSelect() {
    const select = document.getElementById('relocation-product-select');
    fetch('/api/products')
        .then(response => response.json())
        .then(products => {
            select.innerHTML = '<option value="">请选择产品</option>';
            products.forEach(product => {
                const option = document.createElement('option');
                option.value = product.id;
                option.textContent = product.name;
                select.appendChild(option);
            });
        })
        .catch(error => console.error('Error:', error));
}

// 显示移位产品规格
function showProductSpecsForRelocation() {
    const productSelect = document.getElementById('relocation-product-select');
    const boxSpecSelect = document.getElementById('relocation-box-spec');
    const productId = productSelect.value;

    boxSpecSelect.innerHTML = '<option value="">请选择规格</option>';

    if (productId) {
        fetch('/api/stock')
        .then(response => response.json())
        .then(stock => {
            // 过滤掉库存为0的规格，并按过期日期排序
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
                const expiryDate = new Date(item.expiry_date).toLocaleDateString();
                option.textContent = `规格：${item.box_spec}，库存：${item.quantity}箱，库位：${item.location || '未指定'}，过期日期：${expiryDate}`;
                option.dataset.quantity = item.quantity;
                option.dataset.expiryDate = item.expiry_date;
                option.dataset.location = item.location;
                option.dataset.batchNumber = item.batch_number;
                boxSpecSelect.appendChild(option);
            });
        });
    }
}

// 添加到待移位列表
function addToRelocationList() {
    const productSelect = document.getElementById('relocation-product-select');
    const boxSpecSelect = document.getElementById('relocation-box-spec');
    const quantityInput = document.getElementById('relocation-quantity');
    const newLocationSelect = document.getElementById('relocation-new-location');

    const productId = productSelect.value;
    const productName = productSelect.options[productSelect.selectedIndex]?.text || '';
    const boxSpec = boxSpecSelect.value;
    const quantity = parseInt(quantityInput.value);
    const oldLocation = boxSpecSelect.options[boxSpecSelect.selectedIndex]?.dataset.location || '';
    const newLocation = newLocationSelect.value;
    const expiryDate = boxSpecSelect.options[boxSpecSelect.selectedIndex]?.dataset.expiryDate || '';
    const batchNumber = boxSpecSelect.options[boxSpecSelect.selectedIndex]?.dataset.batchNumber || '';

    // 基本验证
    if (!productId || !boxSpec || !quantity || !newLocation) {
        alert('请填写完整信息');
        return;
    }

    if (oldLocation === newLocation) {
        alert('新库位不能与原库位相同');
        return;
    }

    // 获取当前库存信息
    fetch('/api/stock')
        .then(response => response.json())
        .then(stock => {
            const currentStock = stock.find(s =>
                s.product_id === productId &&
                s.box_spec === boxSpec &&
                s.location === oldLocation &&
                s.quantity > 0
            );

            if (!currentStock) {
                alert('无法获取库存信息');
                return;
            }

            if (quantity > currentStock.quantity) {
                alert('移位数量不能大于库存数量');
                return;
            }

            // 检查是否已在列表中
            const existingItem = relocationList.find(item =>
                item.product_id === productId &&
                item.box_spec === boxSpec &&
                item.old_location === oldLocation &&
                item.new_location === newLocation
            );

            if (existingItem) {
                alert('该产品规格已在待移位列表中');
                return;
            }

            // 添加到待移位列表
            relocationList.push({
                product_id: productId,
                product_name: productName,
                box_spec: boxSpec,
                quantity: quantity,
                old_location: oldLocation,
                new_location: newLocation,
                batch_number: batchNumber,
                expiry_date: expiryDate
            });

            // 更新待移位列表显示
            updateRelocationListDisplay();

            // 清空输入
            quantityInput.value = '';
            boxSpecSelect.innerHTML = '<option value="">请选择规格</option>';
            productSelect.value = '';
            newLocationSelect.value = '';
        })
        .catch(error => {
            console.error('Error:', error);
            alert('添加到待移位列表失败: ' + error.message);
        });
}

// 更新待移位列表显示
function updateRelocationListDisplay() {
    const tbody = document.getElementById('relocation-products-body');
    tbody.innerHTML = '';

    relocationList.forEach((item, index) => {
        const tr = document.createElement('tr');
        const formattedExpiryDate = item.expiry_date ? new Date(item.expiry_date).toLocaleDateString() : '无';

        tr.innerHTML = `
            <td>${item.product_name}</td>
            <td>${item.old_location || '未指定'}</td>
            <td>${item.new_location}</td>
            <td>${item.box_spec}</td>
            <td>${item.quantity}</td>
            <td>${item.batch_number || '无'}</td>
            <td>${formattedExpiryDate}</td>
            <td>
                <button onclick="removeFromRelocationList(${index})">删除</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// 从待移位列表中移除
function removeFromRelocationList(index) {
    relocationList.splice(index, 1);
    updateRelocationListDisplay();
}

// 确认移位操作
function confirmRelocation() {
    if (relocationList.length === 0) {
        alert('待移位列表为空');
        return;
    }

    if (!confirm('确认要执行移位操作吗？')) {
        return;
    }

    const promises = [];

    // 对每个移位项目先出库后入库
    relocationList.forEach(item => {
        // 出库操作
        const outgoingPromise = fetch('/api/outgoing', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                product_id: item.product_id,
                box_spec: item.box_spec,
                quantity: item.quantity,
                outgoing_reason: '移位',  // 设置出库原因为"移位"
                batch_number: item.batch_number,  // 添加批次号
                location: item.old_location  // 添加原库位信息
            })
        }).then(response => response.json());

        // 入库操作，依赖于出库成功
        const incomingPromise = outgoingPromise.then(outResult => {
            if (outResult.error) {
                throw new Error(outResult.message || '出库操作失败');
            }

            return fetch('/api/incoming', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    product_id: item.product_id,
                    box_spec: item.box_spec,
                    quantity: item.quantity,
                    batch_number: item.batch_number,
                    incoming_reason: '移位',  // 设置入库原因为"移位"
                    expiry_date: item.expiry_date,
                    location: item.new_location
                })
            }).then(response => response.json());
        });

        promises.push(incomingPromise);
    });

    // 处理所有请求
    Promise.all(promises)
        .then(results => {
            alert('移位操作成功完成');
            relocationList = [];  // 清空待移位列表
            updateRelocationListDisplay();
            displayStockList();   // 更新库存列表
            displayRecords();     // 更新记录列表
        })
        .catch(error => {
            console.error('移位操作失败:', error);
            alert('移位操作失败: ' + error.message);
        });
}

// 打开修改记录模态框
function openEditRecordModal(recordId) {
    // 检查用户是否为管理员
    getCurrentUser().then(user => {
        if (!user || !user.is_admin) {
            alert('只有管理员可以修改记录');
            return;
        }
        
        // 获取记录详情
        apiRequest('/api/records')
            .then(records => {
                const record = records.find(r => r.id === recordId);
                if (record) {
                    document.getElementById('edit-record-id').value = record.id;
                    document.getElementById('edit-record-product').value = record.product_name;
                    document.getElementById('edit-record-operation').value = record.operation_type;
                    document.getElementById('edit-record-quantity').value = record.quantity;
                    document.getElementById('edit-record-box-spec').value = record.box_spec || '';
                    document.getElementById('edit-record-reason').value = record.reason || '';
                    document.getElementById('edit-record-batch-number').value = record.batch_number || '';
                    
                    // 处理过期日期格式
                    if (record.expiry_date) {
                        // 将日期格式化为YYYY-MM-DD格式
                        const expiryDate = new Date(record.expiry_date);
                        const formattedDate = expiryDate.toISOString().split('T')[0];
                        document.getElementById('edit-record-expiry-date').value = formattedDate;
                    } else {
                        document.getElementById('edit-record-expiry-date').value = '';
                    }
                    
                    document.getElementById('edit-record-modal').style.display = 'block';
                } else {
                    alert('找不到记录');
                }
            })
            .catch(error => {
                console.error('获取记录失败:', error);
                alert('获取记录失败: ' + error);
            });
    });
}

// 更新记录
function updateRecord() {
    const recordId = document.getElementById('edit-record-id').value;
    const quantity = parseInt(document.getElementById('edit-record-quantity').value);
    const boxSpec = document.getElementById('edit-record-box-spec').value;
    const reason = document.getElementById('edit-record-reason').value;
    const batchNumber = document.getElementById('edit-record-batch-number').value;
    const expiryDate = document.getElementById('edit-record-expiry-date').value;
    
    // 验证输入
    if (isNaN(quantity) || quantity <= 0) {
        alert('请输入有效的数量');
        return;
    }
    
    if (!boxSpec.trim()) {
        alert('请输入有效的规格');
        return;
    }
    
    if (!reason.trim()) {
        alert('请输入原因');
        return;
    }
    
    // 发送请求
    apiRequest('/api/records/update', 'POST', {
        record_id: recordId,
        quantity: quantity,
        box_spec: boxSpec,
        reason: reason,
        batch_number: batchNumber,
        expiry_date: expiryDate
    })
        .then(response => {
            if (response.success) {
                alert('记录修改成功');
                document.getElementById('edit-record-modal').style.display = 'none';
                // 刷新记录列表
                displayRecords();
            } else {
                alert(response.message || '修改失败');
            }
        })
        .catch(error => {
            console.error('修改记录失败:', error);
            alert('修改记录失败: ' + error);
        });
}

