const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kakeiboApi', {
  getCategories: () => ipcRenderer.invoke('categories:get'),
  listTransactions: (month) => ipcRenderer.invoke('transactions:list', month),
  getSummary: (month) => ipcRenderer.invoke('summary:get', month),
  createTransaction: (payload) => ipcRenderer.invoke('transactions:create', payload),
  updateTransaction: (id, payload) => ipcRenderer.invoke('transactions:update', id, payload),
  deleteTransaction: (id) => ipcRenderer.invoke('transactions:delete', id),
  exportCsv: () => ipcRenderer.invoke('csv:export'),
  importCsv: () => ipcRenderer.invoke('csv:import')
});
