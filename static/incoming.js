// Incoming list management and recording
let incomingList = [];

function loadIncomingListFromStorage() {
    const saved = localStorage.getItem('incomingList');
    try { incomingList = saved ? JSON.parse(saved) : []; } catch { incomingList = []; }
}

function saveIncomingListToStorage() {
    localStorage.setItem('incomingList', JSON.stringify(incomingList));
}

function addToIncomingList(productId, productName) {
    const quantityEl = document.getElementById('incoming-quantity');
    const boxSpecEl = document.getElementById('incoming-box-spec');
    const batchNumberEl = document.getElementById('incoming-batch-number');
    const expiryDateEl = document.getElementById('incoming-expiry-date');
    const locationEl = document.getElementById('incoming-location');
    if (!quantityEl || !boxSpecEl || !batchNumberEl || !expiryDateEl || !locationEl) { alert('缺少入库信息'); return; }
    const quantity = parseInt(quantityEl.value);
    const boxSpec = boxSpecEl.value.trim();
    const batchNumber = batchNumberEl.value.trim();
    const expiryDate = expiryDateEl.value;
    const location = locationEl.value.trim();
    if (isNaN(quantity) || quantity <= 0) { alert('请输入有效的数量'); return; }
    if (!boxSpec) { alert('请输入规格'); return; }
    if (!location) { alert('请选择库位'); return; }
    incomingList.push({ product_id: productId, product_name: productName, quantity, box_spec: boxSpec, batch_number: batchNumber, expiry_date: expiryDate, location });
    saveIncomingListToStorage();
    updateIncomingListDisplay();
}

function updateIncomingListDisplay() {
    const listEl = document.getElementById('incoming-list');
    if (!listEl) return;
    listEl.innerHTML = '';
    incomingList.forEach((item, index) => {
        const li = document.createElement('li');
        li.textContent = `${item.product_name} - 数量: ${item.quantity}, 规格: ${item.box_spec}, 批次: ${item.batch_number || '-'}, 库位: ${item.location}`;
        const removeBtn = document.createElement('button');
        removeBtn.textContent = '移除';
        removeBtn.className = 'small-button';
        removeBtn.onclick = () => removeFromIncomingList(index);
        li.appendChild(removeBtn);
        listEl.appendChild(li);
    });
}

function removeFromIncomingList(index) {
    incomingList.splice(index, 1);
    saveIncomingListToStorage();
    updateIncomingListDisplay();
}

function recordIncoming() {
    if (incomingList.length === 0) { alert('入库列表为空'); return; }
    const confirmMsg = '确认记录以下入库项？';
    if (!confirm(confirmMsg)) return;
    apiRequest('/api/incoming', 'POST', { items: incomingList })
        .then(response => {
            if (response.success) {
                alert('入库记录成功');
                incomingList = [];
                saveIncomingListToStorage();
                updateIncomingListDisplay();
            } else { alert(response.message || '入库失败'); }
        })
        .catch(error => { console.error('记录入库失败:', error); alert('记录入库失败'); });
}

function populateIncomingProductSelect() {
    const selectEl = document.getElementById('incoming-product-select');
    if (!selectEl) return;
    selectEl.innerHTML = '<option value="">选择产品</option>';
    apiRequest('/api/products')
        .then(products => {
            products.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = p.name;
                selectEl.appendChild(opt);
            });
        })
        .catch(error => { console.error('加载产品失败:', error); });
}

document.addEventListener('DOMContentLoaded', () => {
    loadIncomingListFromStorage();
    updateIncomingListDisplay();
});