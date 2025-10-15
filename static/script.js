// 全局变量
let current_merchant = { name: '未知商户' };
let merchantsLoading = false;
let merchantsRequestToken = 0;

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
    } else if (tabName === 'incoming') {
    
        loadIncomingListFromStorage(); // 加载待入库列表
        populateIncomingProductSelect(); // 加载产品选择框
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

// 页面加载完成后执行初始化
document.addEventListener('DOMContentLoaded', function() {
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
// getCurrentUser 由 static/session.js 提供

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
        const editUserIsAdminEl = document.getElementById('edit-user-is-admin');
        const editUserIdEl = document.getElementById('edit-user-id');
        
        if (!editUserIsAdminEl || !editUserIdEl) {
            console.debug('编辑用户表单元素不存在');
            return;
        }
        
        editUserIsAdminEl.checked = user.is_admin;
        editUserIdEl.value = user.id;
        
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
    const editUserIdEl = document.getElementById('edit-user-id');
    const editUserIsAdminEl = document.getElementById('edit-user-is-admin');
    
    if (!editUserIdEl || !editUserIsAdminEl) {
        console.error('编辑用户表单元素不存在');
        return;
    }
    
    const userId = editUserIdEl.value;
    const isAdmin = editUserIsAdminEl.checked;
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
        
        if (!container) {
            console.debug('权限容器元素不存在:', containerId);
            return;
        }
        
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
    if (!container) {
        console.debug('权限容器不存在:', containerId);
        return [];
    }
    const checkboxes = container.querySelectorAll('input[type="checkbox"]:checked');
    return Array.from(checkboxes).map(cb => parseInt(cb.value));
}

// 添加新用户
function addUser() {
    const usernameElement = document.getElementById('new-user-username');
    const passwordElement = document.getElementById('new-user-password');
    const isAdminElement = document.getElementById('new-user-is-admin');
    
    if (!usernameElement || !passwordElement || !isAdminElement) {
        console.debug('Required elements not found for user addition');
        return;
    }
    
    const username = usernameElement.value;
    const password = passwordElement.value;
    const isAdmin = isAdminElement.checked;
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
                const detail = err.error ? ` (${err.error})` : '';
                throw new Error((err.message || '网络响应不正常') + detail);
            });
        }
        return response.json();
    })
    .then(data => {
        alert(data.message);
        // 清空输入框
        const newUserUsernameEl = document.getElementById('new-user-username');
        const newUserPasswordEl = document.getElementById('new-user-password');
        const newUserIsAdminEl = document.getElementById('new-user-is-admin');
        
        if (newUserUsernameEl) newUserUsernameEl.value = '';
        if (newUserPasswordEl) newUserPasswordEl.value = '';
        if (newUserIsAdminEl) newUserIsAdminEl.checked = false;
        // 重新加载用户列表
        loadUsers();
    })
    .catch(error => {
        console.debug('Error:', error);
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
    
    if (!nameInput) {
        console.error('Required element not found for merchant addition');
        return;
    }
    
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

// 加载商户列表函数，从后端获取商户数据并更新商户选择器
function loadMerchants() {
    const merchantDropdown = document.getElementById('merchant-dropdown');
    const currentMerchantName = document.getElementById('current-merchant-name');
    const merchantListBody = document.getElementById('merchant-list-body');

    merchantsRequestToken += 1;
    const token = merchantsRequestToken;
    merchantsLoading = true;

    apiRequest('/api/merchants')
        .then(merchants => {
            if (token !== merchantsRequestToken) return;

            if (merchantListBody) {
                merchantListBody.innerHTML = '';
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
            }

            return apiRequest('/api/merchants/current').then(response => ({ merchants, response }));
        })
        .then(({ merchants, response }) => {
            if (token !== merchantsRequestToken) return;

            if (response && response.success) {
                const currentMerchant = response.merchant;
                // 更新全局当前商户，供其他模块使用（如 location.js）
                window.current_merchant = currentMerchant;
                if (currentMerchantName) {
                    currentMerchantName.textContent = currentMerchant.name;
                }

                if (merchantDropdown) {
                    merchantDropdown.innerHTML = '';
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

                    const currentMerchantElement = document.getElementById('current-merchant');
                    if (currentMerchantElement) {
                        currentMerchantElement.onclick = function() {
                            merchantDropdown.classList.toggle('show');
                            const dropdownIcon = document.querySelector('.dropdown-icon');
                            if (dropdownIcon) {
                                dropdownIcon.style.transform = merchantDropdown.classList.contains('show') ? 'rotate(180deg)' : '';
                            }
                        };
                    }
                }
            } else {
                if (currentMerchantName) {
                    currentMerchantName.textContent = '未选择商户';
                }
            }
        })
        .catch(error => {
            if (token !== merchantsRequestToken) return;
            console.error('加载商户列表失败:', error);
        })
        .finally(() => {
            if (token === merchantsRequestToken) {
                merchantsLoading = false;
            }
        });
}

// 切换当前商户
function switchMerchant(merchantId) {
    apiRequest('/api/merchants/switch', 'POST', { merchant_id: merchantId })
        .then(response => {
            if (response.success) {
                // 刷新商户相关UI与当前页面数据，避免整页重载
                loadMerchants();
                if (typeof pageInit === 'function') {
                    try { pageInit(); } catch (e) { console.warn('pageInit 执行失败:', e); }
                }
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

// Example of converting a date string to Beijing Time in JavaScript
function convertToBeijingTime(dateString) {
    // 直接使用后端返回的北京时间字符串进行格式化
    return new Date(dateString).toLocaleString();
}