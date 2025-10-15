// Merchant management legacy helpers (renamed to avoid overriding global functions)
function legacyAddMerchant() {
    const nameInput = document.getElementById('new-merchant-name');
    if (!nameInput) { alert('请输入商户名称'); return; }
    const name = nameInput.value.trim();
    if (!name) { alert('请输入商户名称'); return; }
    apiRequest('/api/merchants', 'POST', { name })
        .then(response => {
            if (response.success) { alert('商户添加成功'); nameInput.value = ''; loadMerchants(); }
            else { alert(response.message || '添加失败'); }
        })
        .catch(error => { console.error('添加商户失败:', error); alert('添加商户失败'); });
}

function legacyConfirmDeleteMerchant(merchantId) {
    if (confirm('确认删除该商户？')) { legacyDeleteMerchant(merchantId); }
}

function legacyDeleteMerchant(merchantId) {
    apiRequest(`/api/merchants/${merchantId}`, 'DELETE')
        .then(response => {
            if (response.success) { alert('商户删除成功'); loadMerchants(); }
            else { alert(response.message || '删除失败'); }
        })
        .catch(error => { console.error('删除商户失败:', error); alert('删除商户失败'); });
}

function exportStockToExcel() {
    apiRequest('/api/stock')
        .then(stocks => {
            const headers = ['品名', '规格', '批次号', '库位', '数量', '总数', '过期日期'];
            const wsData = [ headers, ...stocks.map(s => [
                s.product_name,
                s.box_spec,
                s.batch_number || '-',
                s.location || '-',
                s.quantity,
                s.total !== null ? s.total : '-',
                s.expiry_date ? new Date(s.expiry_date).toLocaleDateString() : '-'
            ]) ];
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.aoa_to_sheet(wsData);
            XLSX.utils.book_append_sheet(wb, ws, '库存');
            XLSX.writeFile(wb, `库存_${new Date().toISOString().slice(0, 10)}.xlsx`);
        })
        .catch(error => { console.error('导出库存失败:', error); alert('导出库存失败'); });
}