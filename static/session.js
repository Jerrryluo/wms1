// Session and user helpers
function getCurrentUser() {
    // 使用后端实际提供的接口路径，并兼容不含 success 字段的返回格式
    return apiRequest('/api/users/current')
        .then(response => {
            if (!response) return null;
            const usernameEl = document.getElementById('current-username');
            if (usernameEl) usernameEl.textContent = response.username || '未知用户';
            updateNavigation(response.permissions || [], !!response.is_admin);
            return { username: response.username, is_admin: !!response.is_admin, permissions: response.permissions || [] };
        })
        .catch(error => {
            console.error('获取当前用户失败:', error);
            return null;
        });
}

function updateNavigation(permissions, isAdmin) {
    const userBtn = document.getElementById('btn-user-management') || document.getElementById('nav-user');
    if (userBtn) userBtn.style.display = isAdmin ? 'inline-block' : 'none';
}

function checkSession() {
    // 统一使用后端定义的连字符路径
    apiRequest('/api/check-session')
        .then(response => {
            // 后端返回 {success: true} 表示会话有效；401 会在 catch 中处理
            if (response && response.success === false) {
                if (typeof silentLogout === 'function') silentLogout();
            }
        })
        .catch(error => {
            console.error('会话检查失败:', error);
            // 如果是会话过期（401 被 apiRequest 转换为 “会话已过期”），执行静默登出
            if (String(error && error.message || '').includes('会话已过期')) {
                if (typeof silentLogout === 'function') silentLogout();
            }
        });
}

function silentLogout() {
    fetch('/logout', { method: 'GET', credentials: 'same-origin' })
        .then(() => { window.location.href = '/login'; })
        .catch(() => { window.location.href = '/login'; });
}

// periodic session check
setInterval(checkSession, 300000);