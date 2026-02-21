const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { initDatabase, createRepository } = require('./src/db');

let repo;

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1120,
    height: 760,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src/index.html'));
}

app.whenReady().then(() => {
  const db = initDatabase(app.getPath('userData'));
  repo = createRepository(db);

  ipcMain.handle('categories:get', () => repo.categories);
  ipcMain.handle('transactions:list', (_, month) => repo.listByMonth(month));
  ipcMain.handle('summary:get', (_, month) => repo.getMonthlySummary(month));

  ipcMain.handle('transactions:create', (_, payload) => {
    const row = repo.create({ ...payload, id: randomUUID() });
    return row;
  });

  ipcMain.handle('transactions:update', (_, id, payload) => repo.update(id, payload));
  ipcMain.handle('transactions:delete', (_, id) => repo.delete(id));

  ipcMain.handle('csv:export', async () => {
    const saveResult = await dialog.showSaveDialog({
      title: 'CSVを保存',
      defaultPath: `kakeibo-${new Date().toISOString().slice(0, 10)}.csv`,
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    });

    if (saveResult.canceled || !saveResult.filePath) {
      return { canceled: true };
    }

    fs.writeFileSync(saveResult.filePath, repo.exportCsv(), 'utf8');
    return { canceled: false, filePath: saveResult.filePath };
  });

  ipcMain.handle('csv:import', async () => {
    const openResult = await dialog.showOpenDialog({
      title: 'CSVを選択',
      properties: ['openFile'],
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    });

    if (openResult.canceled || openResult.filePaths.length === 0) {
      return { canceled: true, imported: 0 };
    }

    const text = fs.readFileSync(openResult.filePaths[0], 'utf8');
    const result = repo.importCsv(text, () => randomUUID());
    return { canceled: false, ...result };
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
