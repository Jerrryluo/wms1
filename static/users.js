// 用户与权限模块：从 script.js 拆分，负责用户列表、权限编辑、增删用户

function loadUsers() {
    apiRequest('/api/users')
        .then(users => {
            const tbody = document.getElementById('user-list-body');
            if (!tbody) return;
            tbody.innerHTML = '';

            users.forEach(user => {
                const permissionsText = (user.permissions || []).map(p => p.description).join(', ') || '无';
                const row = document.createElement('tr');
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
            console.error('加载用户列表失败:', error);
            alert('加载用户列表失败: ' + (error.message || '未知错误'));
        });
}

function editUserPermissions(userId) {
    apiRequest('/api/users')
        .then(users => {
            const user = users.find(u => u.id === userId);
            if (!user) { alert('找不到指定用户'); return; }

            const editUserIsAdminEl = document.getElementById('edit-user-is-admin');
            const editUserIdEl = document.getElementById('edit-user-id');
            if (!editUserIsAdminEl || !editUserIdEl) { console.debug('编辑用户表单元素不存在'); return; }

            editUserIsAdminEl.checked = !!user.is_admin;
            editUserIdEl.value = user.id;

            loadPermissions('edit-user-permissions', user.permissions || []);

            const modal = document.getElementById('edit-permissions-modal');
            if (modal) modal.style.display = 'block';
        })
        .catch(error => {
            console.error('获取用户信息失败:', error);
            alert('获取用户信息失败: ' + (error.message || '未知错误'));
        });
}

function updateUserPermissions() {
    const editUserIdEl = document.getElementById('edit-user-id');
    const editUserIsAdminEl = document.getElementById('edit-user-is-admin');
    if (!editUserIdEl || !editUserIsAdminEl) { console.error('编辑用户表单元素不存在'); return; }

    const userId = editUserIdEl.value;
    const isAdmin = !!editUserIsAdminEl.checked;
    const permissions = getSelectedPermissions('edit-user-permissions');

    apiRequest(`/api/users/${userId}/permissions`, 'PUT', { is_admin: isAdmin, permissions })
        .then(data => {
            alert(data.message || '更新成功');
            const modal = document.getElementById('edit-permissions-modal');
            if (modal) modal.style.display = 'none';
            loadUsers();
        })
        .catch(error => {
            console.error('更新用户权限失败:', error);
            alert('更新用户权限失败: ' + (error.message || '未知错误'));
        });
}

function loadPermissions(containerId, selectedPermissions = []) {
    apiRequest('/api/permissions')
        .then(permissions => {
            const container = document.getElementById(containerId);
            if (!container) { console.debug('权限容器元素不存在:', containerId); return; }

            container.innerHTML = '';
            (permissions || []).forEach(permission => {
                const isChecked = (selectedPermissions || []).some(p => p.id === permission.id);
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
            console.error('加载权限列表失败:', error);
            alert('加载权限列表失败: ' + (error.message || '未知错误'));
        });
}

function getSelectedPermissions(containerId) {
    const container = document.getElementById(containerId);
    if (!container) { console.debug('权限容器不存在:', containerId); return []; }
    const checkboxes = container.querySelectorAll('input[type="checkbox"]:checked');
    return Array.from(checkboxes).map(cb => parseInt(cb.value));
}

function addUser() {
    const usernameElement = document.getElementById('new-user-username');
    const passwordElement = document.getElementById('new-user-password');
    const isAdminElement = document.getElementById('new-user-is-admin');
    if (!usernameElement || !passwordElement || !isAdminElement) { console.debug('新增用户所需元素缺失'); return; }

    const username = usernameElement.value.trim();
    const password = passwordElement.value;
    const isAdmin = !!isAdminElement.checked;
    const permissions = getSelectedPermissions('new-user-permissions');
    if (!username || !password) { alert('请填写用户名和密码'); return; }

    const userData = { username, password, is_admin: isAdmin, permissions };
    apiRequest('/api/users', 'POST', userData)
        .then(data => {
            alert(data.message || '新增成功');
            const newUserUsernameEl = document.getElementById('new-user-username');
            const newUserPasswordEl = document.getElementById('new-user-password');
            const newUserIsAdminEl = document.getElementById('new-user-is-admin');
            if (newUserUsernameEl) newUserUsernameEl.value = '';
            if (newUserPasswordEl) newUserPasswordEl.value = '';
            if (newUserIsAdminEl) newUserIsAdminEl.checked = false;
            loadUsers();
        })
        .catch(error => {
            console.debug('添加用户失败:', error);
            alert('添加用户失败: ' + (error.message || '未知错误'));
        });
}

function deleteUser(userId) {
    if (!confirm('确定要删除此用户吗？此操作不可撤销。')) return;
    apiRequest(`/api/users/${userId}`, 'DELETE')
        .then(data => {
            alert(data.message || '删除成功');
            loadUsers();
        })
        .catch(error => {
            console.error('删除用户失败:', error);
            alert('删除用户失败: ' + (error.message || '未知错误'));
        });
}