// Product management: add, list, sort, delete
let productList = [];

function getCurrentMerchant() {
    const select = document.getElementById('merchant-select');
    return select ? select.value : null;
}

function addProduct() {
    const nameEl = document.getElementById('product-name');
    const specsEl = document.getElementById('product-specs');
    const priceEl = document.getElementById('product-price');
    const merchantId = getCurrentMerchant();
    if (!nameEl || !specsEl || !priceEl || !merchantId) { alert('缺少必填项或未选择商户'); return; }
    const name = nameEl.value.trim();
    const specs = specsEl.value.trim();
    const price = parseFloat(priceEl.value);
    if (!name) { alert('请输入产品名称'); return; }
    if (!specs) { alert('请输入规格'); return; }
    if (isNaN(price) || price < 0) { alert('请输入有效价格'); return; }
    apiRequest('/api/products/add', 'POST', { name, specs, price, merchant_id: merchantId })
        .then(response => {
            if (response.success) {
                alert('产品添加成功');
                loadProducts();
            } else { alert(response.message || '添加失败'); }
        })
        .catch(error => { console.error('添加产品失败:', error); alert('添加产品失败'); });
}

function displayProductList(products) {
    productList = Array.isArray(products) ? products : [];
    renderProductList(productList);
}

function renderProductList(list) {
    const container = document.getElementById('product-list');
    if (!container) return;
    container.innerHTML = '';
    list.forEach(product => {
        const li = document.createElement('li');
        li.innerHTML = `
            <span>${product.name} - ${product.specs || ''} - ￥${product.price ?? '-'}</span>
            <button class="small-button" onclick="confirmDeleteProduct('${product.id}')">删除</button>
            <button class="small-button" onclick="showProductRecords('${product.id}', '${product.name}')">记录</button>
        `;
        container.appendChild(li);
    });
}

function sortProductList(criteria) {
    const listCopy = [...productList];
    if (criteria === 'name') { listCopy.sort((a, b) => (a.name || '').localeCompare(b.name || '')); }
    else if (criteria === 'price') { listCopy.sort((a, b) => (a.price ?? 0) - (b.price ?? 0)); }
    renderProductList(listCopy);
}

function confirmDeleteProduct(productId) {
    if (confirm('确认删除该产品？')) {
        deleteProduct(productId);
    }
}

function deleteProduct(productId) {
    apiRequest(`/api/products/${productId}/delete`, 'DELETE')
        .then(response => {
            if (response.success) { alert('产品删除成功'); loadProducts(); }
            else { alert(response.message || '删除失败'); }
        })
        .catch(error => { console.error('删除产品失败:', error); alert('删除产品失败'); });
}