// Приём отчёта от дашборда. Вставить в Расширения - Apps Script внутри таблицы.
// 1. Замените SECRET на свою длинную случайную строку (то же значение укажите в дашборде).
// 2. Развернуть - Новое развертывание - Веб-приложение: выполнять от своего имени, доступ у всех.
var SECRET = 'ЗАМЕНИТЕ_НА_СЛУЧАЙНУЮ_СТРОКУ';

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    if (!SECRET || SECRET.indexOf('ЗАМЕНИТЕ') === 0 || data.token !== SECRET) return out({ ok: false, error: 'forbidden' });
    var tab = String(data.tab || '').trim();
    var rows = data.rows;
    if (!/^[0-9.]{3,10}$/.test(tab) || !Array.isArray(rows) || rows.length === 0 || rows.length > 200) return out({ ok: false, error: 'bad request' });

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss.getSheetByName(tab)) return out({ ok: false, error: 'tab exists' });

    // Копия последней вкладки сохраняет оформление; данные ниже заголовка очищаются.
    var latest = ss.getSheets()[0];
    var sheet = latest.copyTo(ss).setName(tab);
    ss.setActiveSheet(sheet);
    ss.moveActiveSheet(1);
    var cols = Math.max(sheet.getLastColumn(), 7);
    if (sheet.getMaxRows() > 1) sheet.getRange(2, 1, sheet.getMaxRows() - 1, cols).clearContent();
    if (sheet.getMaxRows() < rows.length + 1) sheet.insertRowsAfter(sheet.getMaxRows(), rows.length + 1 - sheet.getMaxRows());

    var width = rows[0].length;
    var range = sheet.getRange(2, 1, rows.length, width);
    range.setNumberFormat('@'); // текст, чтобы даты не превращались в другой формат
    range.setValues(rows);
    return out({ ok: true, tab: tab, rows: rows.length, url: ss.getUrl() + '#gid=' + sheet.getSheetId() });
  } catch (err) {
    return out({ ok: false, error: String(err) });
  }
}

function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
