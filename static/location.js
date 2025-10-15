// Location query: load locations and fetch products by location
function loadLocations() {
    const locationSelect = document.getElementById('location-select');
    if (!locationSelect) { console.error('location-select 不存在'); return; }
    locationSelect.innerHTML = '<option value="">请选择库位</option>';

    const allMerchantsEl = document.getElementById('all-merchants');
    const isAllMerchants = allMerchantsEl && allMerchantsEl.checked;

    if (!isAllMerchants) { if (typeof getCurrentMerchant === 'function') getCurrentMerchant(); }

    const apiUrl = isAllMerchants ? '/api/all-merchants-stock' : '/api/stock';

    apiRequest(apiUrl)
        .then(stocks => {
            const locations = [...new Set(stocks.filter(stock => stock.quantity > 0).map(stock => stock.location).filter(Boolean))];
            locations.sort((a, b) => {
                const letterA = a.match(/[A-Za-z]+/)
                    ?. [0] || '';
                const letterB = b.match(/[A-Za-z]+/)
                    ?. [0] || '';
                if (letterA !== letterB) return letterA.localeCompare(letterB);
                const numA = parseInt(a.match(/\d+/)
                    ?. [0] || '0', 10);
                const numB = parseInt(b.match(/\d+/)
                    ?. [0] || '0', 10);
                return numA - numB;
            });
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

function fetchProductsByLocation() {
    const locationSelect = document.getElementById('location-select');
    const locationProductsBody = document.getElementById('location-products-body');
    const allMerchantsElement = document.getElementById('all-merchants');
    if (!locationSelect || !locationProductsBody || !allMerchantsElement) {
        console.error('库位查询所需元素缺失');
        return;
    }

    const selectedLocation = locationSelect.value;
    const isAllMerchants = allMerchantsElement.checked;
    locationProductsBody.innerHTML = '';
    if (!selectedLocation) { return; }

    const apiUrl = isAllMerchants ? '/api/all-merchants-stock' : '/api/stock';
    apiRequest(apiUrl)
        .then(stocks => {
            const filteredStocks = stocks.filter(stock => stock.location === selectedLocation && stock.quantity > 0);
            if (filteredStocks.length === 0) {
                const emptyRow = document.createElement('tr');
                emptyRow.innerHTML = `<td colspan="6" style="text-align: center;">该库位没有产品</td>`;
                locationProductsBody.appendChild(emptyRow);
                return;
            }
            filteredStocks.forEach(stock => {
                const row = document.createElement('tr');
                const merchantName = isAllMerchants ? stock.merchant_name : '';
                row.innerHTML = `
                    <td>${stock.product_id}</td>
                    <td>${stock.name}</td>
                    <td>${isAllMerchants ? merchantName : (window.current_merchant ? window.current_merchant.name : '')}</td>
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
        });
}