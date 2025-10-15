// Incoming operations (table UI): manage list and confirm incoming
let incomingList = [];

function loadIncomingListFromStorage() {
    apiRequest('/api/merchants/current')
        .then(response => {
            if (response.success && response.merchant) {
                const merchantId = response.merchant.id;
                const storedList = localStorage.getItem(`incomingList_${merchantId}`);
                incomingList = storedList ? JSON.parse(storedList) : [];
                updateIncomingListDisplay();
            }
        })
        .catch(error => { console.error('获取当前商户失败:', error); });
}

function saveIncomingListToStorage() {
    apiRequest('/api/merchants/current')
        .then(response => {
            if (response.success && response.merchant) {
                const merchantId = response.merchant.id;
                localStorage.setItem(`incomingList_${merchantId}`, JSON.stringify(incomingList));
            }
        })
        .catch(error => { console.error('获取当前商户失败:', error); });
}

function addToIncomingList() {
    const productSelect = document.getElementById('incoming-product-id');
    const boxSpecElement = document.getElementById('incoming-box-spec');
    const quantityElement = document.getElementById('incoming-box-quantity');
    const batchNumberElement = document.getElementById('incoming-batch-number');
    const reasonElement = document.getElementById('incoming-reason');
    const shelfLifeElement = document.getElementById('incoming-shelf-life');
    const locationElement = document.getElementById('incoming-location');
    if (!productSelect || !boxSpecElement || !quantityElement || !batchNumberElement || !reasonElement || !shelfLifeElement || !locationElement) {
        console.error('入库表单元素不存在');
        return;
    }
    const productId = productSelect.getProductId ? productSelect.getProductId() : '';
    const productName = productSelect.value || '未知产品';
    const boxSpec = boxSpecElement.value;
    const quantity = quantityElement.value;
    const batchNumber = batchNumberElement.value;
    const reason = reasonElement.value;
    const shelfLife = shelfLifeElement.value;
    const location = locationElement.value;
    if (!productId || !boxSpec || !quantity || !batchNumber || !reason || !shelfLife || !location) { alert('请填写所有必填字段'); return; }
    if (parseInt(quantity) <= 0) { alert('入库数量必须大于0'); return; }
    const existingItem = incomingList.find(item => item.product_id === productId && item.box_spec === boxSpec && item.batch_number === batchNumber && item.location === location);
    if (existingItem) { alert('该产品规格已在待入库列表中'); return; }
    incomingList.push({ product_id: productId, product_name: productName, box_spec: boxSpec, quantity: parseInt(quantity), batch_number: batchNumber, incoming_reason: reason, expiry_date: shelfLife, location });
    updateIncomingListDisplay();
    saveIncomingListToStorage();
    boxSpecElement.value = '';
    quantityElement.value = '';
    batchNumberElement.value = new Date().toISOString().slice(0,10).replace(/-/g,'');
    shelfLifeElement.value = '';
    locationElement.value = '';
}

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

function removeFromIncomingList(index) {
    incomingList.splice(index, 1);
    updateIncomingListDisplay();
    saveIncomingListToStorage();
}

function recordIncoming() {
    if (incomingList.length === 0) { alert('待入库列表为空'); return; }
    const incomingRequests = incomingList.map(item => apiRequest('/api/incoming', 'POST', { product_id: item.product_id, box_spec: item.box_spec, quantity: item.quantity, batch_number: item.batch_number, incoming_reason: item.incoming_reason, expiry_date: item.expiry_date, location: item.location }));
    Promise.all(incomingRequests)
        .then(() => {
            const grouped = incomingList.reduce((acc, item) => { (acc[item.product_id] ||= { product_name: item.product_name, total_quantity: 0, specs: [] }); acc[item.product_id].total_quantity += item.quantity; acc[item.product_id].specs.push({ box_spec: item.box_spec, quantity: item.quantity, location: item.location }); return acc; }, {});
            let msg = '入库成功！\n\n';
            msg += '日期：' + new Date().toLocaleString() + '\n\n';
            const totalTypes = Object.keys(grouped).length;
            const totalBoxes = incomingList.reduce((sum, item) => sum + item.quantity, 0);
            msg += `总计：${totalTypes}个产品，${totalBoxes}箱\n\n`;
            msg += '入库清单：\n';
            msg += '品名（总箱数）\t规格明细\t库位\n';
            for (const productId in grouped) {
                const product = grouped[productId];
                msg += `${product.product_name}（${product.total_quantity}箱）\n`;
                product.specs.forEach(spec => { msg += `\t${spec.box_spec}\t${spec.quantity}箱\t${spec.location}\n`; });
            }
            alert(msg);
            incomingList = [];
            apiRequest('/api/merchants/current')
                .then(response => { if (response.success && response.merchant) { localStorage.removeItem(`incomingList_${response.merchant.id}`); } })
                .catch(error => { console.error('获取当前商户失败:', error); });
            updateIncomingListDisplay();
            const stockTabEl = document.getElementById('stock');
            if (stockTabEl && stockTabEl.style && stockTabEl.style.display === 'block') { if (typeof displayStockList === 'function') displayStockList(); }
            const recordsTabEl = document.getElementById('records');
            if (recordsTabEl && recordsTabEl.style && recordsTabEl.style.display === 'block') { if (typeof displayRecords === 'function') displayRecords(); }
        })
        .catch(error => { if (typeof handleApiError === 'function') handleApiError(error, '入库操作'); else { console.error('入库操作失败:', error); alert('入库操作失败'); } });
}

function populateIncomingProductSelect() {
    const incomingProductSelect = document.getElementById('incoming-product-id');
    if (!incomingProductSelect) { return; }
    const parentElement = incomingProductSelect.parentNode;
    incomingProductSelect.remove();
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
                const filteredProducts = filterTerm ? allProducts.filter(product => product.name.toLowerCase().includes(filterTerm.toLowerCase()) || product.id.toLowerCase().includes(filterTerm.toLowerCase())) : allProducts;
                filteredProducts.forEach(product => {
                    const item = document.createElement('div');
                    item.style.padding = '8px';
                    item.style.cursor = 'pointer';
                    item.style.borderBottom = '1px solid #eee';
                    item.textContent = product.name;
                    item.addEventListener('mouseover', () => { item.style.backgroundColor = '#f0f0f0'; });
                    item.addEventListener('mouseout', () => { item.style.backgroundColor = 'white'; });
                    item.addEventListener('click', () => { searchInput.value = product.name; selectedProductId = product.id; dropdownList.style.display = 'none'; if (typeof showProductSpecs === 'function') showProductSpecs(); });
                    dropdownList.appendChild(item);
                });
                dropdownList.style.display = filteredProducts.length > 0 ? 'block' : 'none';
            }
            searchInput.addEventListener('input', (e) => { selectedProductId = ''; updateDropdownList(e.target.value); });
            searchInput.addEventListener('focus', () => { updateDropdownList(searchInput.value); });
            document.addEventListener('click', (e) => { if (!container.contains(e.target)) { dropdownList.style.display = 'none'; } });
            const expiryDateInput = document.getElementById('incoming-shelf-life');
            const today = new Date();
            const twoYearsLater = new Date(today.setFullYear(today.getFullYear() + 2));
            if (expiryDateInput) { expiryDateInput.value = twoYearsLater.toISOString().split('T')[0]; }
        })
        .catch(error => { console.error('加载产品列表失败:', error); });
    searchInput.getProductId = function() { return selectedProductId; };
}