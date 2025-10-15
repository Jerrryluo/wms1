// 产品表格模块：新增、加载、渲染、排序、编辑与删除确认
let productList = [];
let currentUserIsAdmin = false;

// 初始化当前用户权限，并在获取后重新渲染产品列表（保证按钮可见）
getCurrentUser()
  .then(u => {
    if (u && typeof u.is_admin !== 'undefined') {
      currentUserIsAdmin = !!u.is_admin;
      if (Array.isArray(productList) && productList.length > 0) {
        renderProductList(productList);
      }
    }
  })
  .catch(() => {});

// 新增产品（与页面表单字段保持一致）
function addProduct() {
    const productIdElement = document.getElementById('new-product-id');
    const productNameElement = document.getElementById('new-product-name');
    const productCategoryElement = document.getElementById('new-product-category');
    const productSupplierElement = document.getElementById('new-product-supplier');
    
    if (!productIdElement || !productNameElement || !productCategoryElement || !productSupplierElement) {
        console.error('添加产品表单元素不存在');
        return;
    }

    const productId = productIdElement.value;
    const productName = productNameElement.value;
    const productCategory = productCategoryElement.value;
    const productSupplier = productSupplierElement.value;
    
    if (!productId || !productName || !productCategory || !productSupplier) {
        alert('请填写所有必填项');
        return;
    }

    const product = {
        id: productId,
        name: productName,
        category: productCategory,
        supplier: productSupplier
    };

    fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(product)
    })
    .then(response => {
        if (!response.ok) throw new Error('网络响应不正常');
        return response.json();
    })
    .then(data => {
        alert(data.message);
        displayProductList();
        if (typeof populateIncomingProductSelect === 'function') {
            try { populateIncomingProductSelect(); } catch (e) { /* noop */ }
        }
        if (typeof populateOutgoingProductSelect === 'function') {
            try { populateOutgoingProductSelect(); } catch (e) { /* noop */ }
        }
    })
    .catch(error => {
        console.error('Error:', error);
        alert('添加产品失败: ' + error.message);
    });

    // 清空输入框
    productIdElement.value = '';
    productNameElement.value = '';
    productCategoryElement.value = '';
    productSupplierElement.value = '';
}

// 加载并显示产品列表
function displayProductList() {
    const productListBody = document.getElementById('product-list-body');
    if (!productListBody) return;
    productListBody.innerHTML = '';

    apiRequest('/api/products')
        .then(products => {
            productList = products;
            renderProductList(productList);
        })
        .catch(error => {
            console.error('加载产品列表失败:', error);
            productListBody.innerHTML = '<tr><td colspan="5">加载产品列表失败</td></tr>';
        });
}

// 渲染产品表格
function renderProductList(products) {
    const productListBody = document.getElementById('product-list-body');
    if (!productListBody) return;
    productListBody.innerHTML = products.map(product => `
        <tr>
            <td>${product.id}</td>
            <td onclick="showProductRecords('${product.id}')" style="cursor: pointer; text-decoration: underline; color: #0066cc;">${product.name}</td>
            <td>${product.category}</td>
            <td>${product.supplier}</td>
            <td>
                ${currentUserIsAdmin ? `<button onclick="openEditProductModal('${product.id}')">修改</button>` : ''}
                <button onclick="confirmDeleteProduct('${product.id}', '${product.name}')">删除</button>
            </td>
        </tr>
    `).join('');
}

// 产品列表排序
function sortProductList(key) {
    const sorted = [...productList].sort((a, b) => {
        if (a[key] < b[key]) return -1;
        if (a[key] > b[key]) return 1;
        return 0;
    });
    renderProductList(sorted);
}

// 删除确认（需要输入“删除”）
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

// 删除产品
function deleteProduct(productId) {
    const confirmInput = document.getElementById('delete-confirmation');
    if (!confirmInput || confirmInput.value !== '删除') {
        alert('请输入"删除"以确认操作');
        return;
    }

    fetch(`/api/products/${productId}`, { method: 'DELETE' })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                alert('产品删除成功');
                displayProductList();
            } else {
                alert('删除失败: ' + (data.message || '未知错误'));
            }
            const dlg = document.querySelector('.confirm-dialog');
            if (dlg) dlg.remove();
        })
        .catch(error => {
            console.error('Error:', error);
            alert('删除失败: ' + error.message);
        });
}

// 打开产品编辑弹窗（仅管理员）
function openEditProductModal(productId) {
    if (!currentUserIsAdmin) { alert('无权限执行该操作'); return; }
    const product = productList.find(p => p.id === productId);
    if (!product) { alert('未找到产品'); return; }

    const dialog = document.createElement('div');
    dialog.className = 'confirm-dialog';
    dialog.innerHTML = `
        <div class="confirm-content">
            <h3>编辑产品</h3>
            <div class="form-layout">
                <div>
                    <label for="edit-product-id">产品编号:</label>
                    <input type="text" id="edit-product-id" value="${product.id}" />
                </div>
                <div>
                    <label for="edit-product-name">品名:</label>
                    <input type="text" id="edit-product-name" value="${product.name}" />
                </div>
                <div>
                    <label for="edit-product-category">产品类别:</label>
                    <select id="edit-product-category">
                        <option value="">请选择类别</option>
                        <option value="补剂" ${product.category === '补剂' ? 'selected' : ''}>补剂</option>
                        <option value="包装用耗材" ${product.category === '包装用耗材' ? 'selected' : ''}>包装用耗材</option>
                        <option value="生产用耗材" ${product.category === '生产用耗材' ? 'selected' : ''}>生产用耗材</option>
                    </select>
                </div>
                <div>
                    <label for="edit-product-supplier">供应商:</label>
                    <input type="text" id="edit-product-supplier" value="${product.supplier}" />
                </div>
            </div>
            <div class="confirm-buttons">
                <button onclick="saveProductEdit('${productId}')">保存</button>
                <button onclick="this.parentElement.parentElement.remove()">取消</button>
            </div>
        </div>
    `;
    document.body.appendChild(dialog);
}

// 保存产品编辑
function saveProductEdit(oldProductId) {
    const newIdEl = document.getElementById('edit-product-id');
    const nameEl = document.getElementById('edit-product-name');
    const categoryEl = document.getElementById('edit-product-category');
    const supplierEl = document.getElementById('edit-product-supplier');

    if (!newIdEl || !nameEl || !categoryEl || !supplierEl) { alert('表单元素缺失'); return; }
    const newId = newIdEl.value.trim();
    const name = nameEl.value.trim();
    const category = categoryEl.value.trim();
    const supplier = supplierEl.value.trim();

    if (!newId || !name || !category || !supplier) { alert('请填写所有必填项'); return; }

    fetch(`/api/products/${oldProductId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: newId, name, category, supplier })
    })
    .then(res => res.json())
    .then(data => {
        if (data && data.success) {
            alert('产品更新成功');
            displayProductList();
            const dlg = document.querySelector('.confirm-dialog');
            if (dlg) dlg.remove();
        } else {
            alert('更新失败: ' + (data.message || '未知错误'));
        }
    })
    .catch(err => {
        console.error('更新失败:', err);
        alert('更新失败: ' + err.message);
    });
}