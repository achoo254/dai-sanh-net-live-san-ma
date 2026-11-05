/* Chạy thử tại máy: phiên lặp liên tục (sảnh chờ 45s → live 2 phút → nghỉ 45s), kho mã MINH HỌA.
 *   node run-demo-loop-local.js      → mở http://localhost:8790
 * Không dùng file này khi chạy thật. */
'use strict';
const path = require('path');
process.env.DEMO_LOOP = process.env.DEMO_LOOP || '1';
process.env.PORT = process.env.PORT || '8790';
process.env.ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'demo-admin';
process.env.MAX_CONN_PER_IP = process.env.MAX_CONN_PER_IP || '5000';   // cho phép chạy bot test cùng máy
process.env.DB_FILE =process.env.DB_FILE || path.join(__dirname, 'data', 'demo-loop.db');
require('./server-entry-http-static-admin-websocket');
