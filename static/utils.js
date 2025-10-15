// Core utilities used across modules
function handleApiError(error, operation) {
    console.error(`${operation} error:`, error);
    if (error.status === 401) {
        // Session expired
        if (typeof silentLogout === 'function') silentLogout();
        return;
    }
    alert(`${operation}失败: ${error.message || '未知错误'}`);
}

// API request wrapper
function apiRequest(url, method = 'GET', data = null) {
    const options = {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin'
    };
    if (data) options.body = JSON.stringify(data);

    return fetch(url, options)
        .then(response => {
            if (response.ok) return response.json();

            if (response.status === 401) {
                return response.json().then(errorData => {
                    if (errorData.expired) {
                        if (typeof silentLogout === 'function') silentLogout();
                        throw new Error('会话已过期');
                    }
                    throw new Error(errorData.message || '认证失败');
                }).catch(() => {
                    if (typeof silentLogout === 'function') silentLogout();
                    throw new Error('会话已过期');
                });
            }

            const contentType = response.headers.get('Content-Type') || '';
            if (contentType.includes('application/json')) {
                return response.json().then(err => {
                    const msg = (err && (err.message || err.error || err.detail)) ? (err.message || err.error || err.detail) : response.statusText;
                    throw new Error('网络请求失败: ' + msg);
                }).catch(() => {
                    throw new Error('网络请求失败: ' + response.statusText);
                });
            }
            return response.text().then(text => { throw new Error('网络请求失败: ' + (text || response.statusText)); });
        })
        .catch(error => {
            if (error.message !== '会话已过期') console.error('API请求错误:', error);
            throw error;
        });
}

function convertToBeijingTime(dateString) {
    return new Date(dateString).toLocaleString();
}