// ==UserScript==
// @name         CDK 福利自动领取
// @namespace    http://tampermonkey.net/
// @version      4.4.0
// @description  自动扫描linux.do站内CDK链接，倒计时提醒，自动跳转并点击领取
// @author       A嘉技术
// @match        https://linux.do/*
// @match        https://cdk.linux.do/*
// @updateURL    https://github.com/Aixgeekx/Linux-do-CDK-/raw/main/cdk-auto-claim.user.js
// @downloadURL  https://github.com/Aixgeekx/Linux-do-CDK-/raw/main/cdk-auto-claim.user.js
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        window.open
// @run-at       document-end
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    const VERSION = '4.4.0';
    const UPDATE_URL = 'https://github.com/Aixgeekx/Linux-do-CDK-/raw/main/cdk-auto-claim.user.js';
    const CFG = {
        cdkPattern: /https?:\/\/cdk\.linux\.do\/receive\/[\w-]+/g,  // 匹配CDK链接
        scanInterval: (GM_getValue('cdk_scan_interval', 60) || 60) * 1000, // 扫描间隔秒数
        preJumpSec: 5,          // 提前跳转秒数
        claimSelectors: [       // CDK页面领取按钮选择器
            'button.h-9.w-full.rounded-full:not([disabled]):not(.cursor-not-allowed)',
            'button:has(.lucide-gift)',
            'button:has(.lucide-coins)',
        ],
        claimTexts: ['立即领取', '领取', '支付'],
        clickDelay: 2000,
        retryInterval: 500,
        retryMax: 60,
    };

    const isCDKPage = location.hostname.includes('cdk.linux.do');

    // ============================================================
    //  CDK页面：自动点击领取按钮
    // ============================================================
    if (isCDKPage) {
        function findBtn() {
            for (const s of CFG.claimSelectors) {
                try { const b = document.querySelector(s); if (b && !b.disabled) return b; } catch(e) {}
            }
            for (const b of document.querySelectorAll('button:not([disabled])')) {
                const t = (b.textContent||'').trim();
                if (CFG.claimTexts.some(k => t.includes(k)) && !t.includes('时间未到') && !t.includes('已结束') && !t.includes('已空')) return b;
            }
            return null;
        }
        function isWaiting(b) { const t = (b.textContent||'').trim(); return t.includes('时间未到') || b.disabled; }
        function tryClick(n=0) {
            const b = findBtn();
            if (b) {
                if (isWaiting(b)) { if (n < CFG.retryMax) setTimeout(() => tryClick(n+1), CFG.retryInterval); return; }
                b.scrollIntoView({behavior:'smooth',block:'center'});
                setTimeout(() => b.click(), 300);
            } else if (n < CFG.retryMax) {
                setTimeout(() => tryClick(n+1), CFG.retryInterval);
            }
        }
        let done = false;
        const obs = new MutationObserver(() => {
            if (done) return;
            const b = findBtn();
            if (b && !isWaiting(b)) { done = true; obs.disconnect(); tryClick(); }
        });
        obs.observe(document.body, {childList:true,subtree:true,attributes:true,characterData:true});
        setTimeout(() => { if (!done) { done = true; obs.disconnect(); tryClick(); } }, CFG.clickDelay);
        const si = setInterval(() => {
            const b = findBtn();
            if (b) {
                const t = b.textContent.trim();
                if (t.includes('立即领取')||t.includes('支付')) { if(!done){done=true;clearInterval(si);tryClick();} }
                else if (t.includes('已结束')||t.includes('已空')||t.includes('已完成')) clearInterval(si);
            }
        }, 1000);
        setTimeout(() => { clearInterval(si); obs.disconnect(); }, 30000);
        return;
    }

    // ============================================================
    //  论坛页面
    // ============================================================

    // ===== 样式 =====
    const css = `
        #cdk-panel{position:fixed;top:50%;transform:translateY(-50%);right:-340px;width:360px;max-height:60vh;background:#fff;border:2px solid #4CAF50;border-radius:8px 0 0 8px;box-shadow:-4px 0 12px rgba(0,0,0,.15);z-index:10000;font-family:Arial,sans-serif;overflow:hidden;display:flex;flex-direction:column;transition:right .3s ease}
        #cdk-panel.show{right:0}
        #cdk-trigger{position:fixed;top:50%;right:0;width:30px;height:80px;background:#4CAF50;border-radius:8px 0 0 8px;z-index:9999;transform:translateY(-50%);cursor:pointer;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:bold;font-size:13px;writing-mode:vertical-rl;box-shadow:-2px 0 8px rgba(0,0,0,.2);transition:width .2s,background .2s}
        #cdk-trigger:hover{width:35px;background:#45a049}
        #cdk-header{background:#4CAF50;color:#fff;padding:12px 15px;font-weight:bold;font-size:14px;display:flex;justify-content:space-between;align-items:center;flex-shrink:0}
        #cdk-version{font-size:11px;opacity:.7;font-weight:normal;margin-left:6px}
        #cdk-ctrls{display:flex;gap:10px}
        #cdk-pin,#cdk-close{background:transparent;border:none;color:#fff;cursor:pointer;padding:0;width:24px;height:24px;line-height:24px;text-align:center}
        #cdk-pin{font-size:18px;opacity:.7}#cdk-pin:hover{opacity:1}#cdk-pin.pinned{opacity:1;transform:rotate(45deg);color:#FFD700}
        #cdk-close{font-size:24px}
        #cdk-body{padding:12px;overflow-y:auto;flex:1}
        #cdk-tabs{display:flex;gap:0;margin-bottom:10px;border-bottom:2px solid #eee}
        .cdk-tab{flex:1;padding:7px;text-align:center;cursor:pointer;font-size:12px;font-weight:bold;color:#888;border-bottom:2px solid transparent;margin-bottom:-2px;transition:all .2s}
        .cdk-tab.active{color:#4CAF50;border-bottom-color:#4CAF50}
        .cdk-tab-content{display:none}.cdk-tab-content.active{display:block}
        #cdk-scan-status{font-size:11px;color:#888;margin-bottom:8px;display:flex;align-items:center;gap:6px}
        #cdk-scan-dot{width:8px;height:8px;border-radius:50%;background:#4CAF50;animation:cdk-dot 2s infinite}
        @keyframes cdk-dot{0%,100%{opacity:1}50%{opacity:.3}}
        .cdk-notice{background:#FFF3CD;border:1px solid #FFE69C;border-radius:4px;padding:8px;margin-bottom:10px;font-size:11px;color:#856404}
        .cdk-notice b{display:block;margin-bottom:3px}
        #cdk-update-box{display:none;background:#E3F2FD;border:1px solid #90CAF9;border-radius:4px;padding:8px;margin-bottom:8px;font-size:11px;color:#0D47A1}
        #cdk-update-box a{color:#1565C0;text-decoration:underline;font-weight:bold}
        .cdk-btn-sm{background:#2196F3;color:#fff;border:none;padding:4px 10px;border-radius:3px;cursor:pointer;font-size:11px}
        .cdk-btn-sm:hover{background:#1976D2}
        .cdk-btn-sm.orange{background:#FF9800}.cdk-btn-sm.orange:hover{background:#F57C00}
        .cdk-scan-item{background:#f0f8ff;border:1px solid #b3d9ff;border-radius:4px;padding:8px;margin-bottom:6px}
        .cdk-scan-item .name{font-weight:bold;font-size:12px;color:#333;margin-bottom:2px;word-break:break-word}
        .cdk-scan-item .url{font-size:11px;color:#2196F3;word-break:break-all;margin-bottom:4px}
        .cdk-scan-item .time{font-size:11px;color:#FF9800;margin-bottom:4px}
        .cdk-scan-item .actions{display:flex;gap:6px}
        .cdk-fg{margin-bottom:10px}.cdk-fg label{display:block;margin-bottom:4px;font-weight:bold;font-size:12px;color:#333}
        .cdk-fg input[type="text"]{width:100%;padding:7px;border:1px solid #ddd;border-radius:4px;box-sizing:border-box;font-size:12px}
        .cdk-fg input[type="checkbox"]{margin-right:5px}.cdk-hint{font-size:10px;color:#999;margin-top:2px}
        .cdk-btn{background:#4CAF50;color:#fff;border:none;padding:8px 16px;border-radius:4px;cursor:pointer;font-size:13px;width:100%;margin-top:8px}
        .cdk-btn:hover{background:#45a049}
        .cdk-item{background:#f9f9f9;border:1px solid #ddd;border-radius:4px;padding:10px;margin-bottom:8px;position:relative}
        .cdk-item-name{font-weight:bold;font-size:13px;color:#2196F3;margin-bottom:3px;cursor:pointer;text-decoration:underline;word-break:break-word;padding-right:50px}
        .cdk-item-name:hover{color:#1976D2}
        .cdk-item-time{font-size:11px;color:#888;margin-bottom:3px}
        .cdk-item-cd{font-size:14px;font-weight:bold;color:#4CAF50;margin:6px 0}
        .cdk-item-cd.warn{color:#FF9800}.cdk-item-cd.danger{color:#F44336;animation:cdk-blink 1s infinite}
        @keyframes cdk-blink{0%,50%{opacity:1}51%,100%{opacity:.5}}
        .cdk-item-auto{font-size:11px;color:#4CAF50;margin-bottom:3px}
        .cdk-item-del{position:absolute;top:8px;right:8px;background:#F44336;color:#fff;border:none;border-radius:3px;padding:3px 6px;cursor:pointer;font-size:11px}
        .cdk-item-del:hover{background:#d32f2f}
        .cdk-empty{text-align:center;color:#999;padding:15px;font-size:13px}
        #cdk-scan-log{font-size:10px;color:#666;max-height:50px;overflow-y:auto;margin-bottom:6px;background:#f5f5f5;padding:3px 5px;border-radius:3px;display:none}
        .cdk-sort-bar{display:flex;gap:6px;margin-bottom:8px;align-items:center}
        .cdk-sort-bar label{font-size:11px;color:#666}
        .cdk-sort-bar select{font-size:11px;padding:2px 4px;border:1px solid #ddd;border-radius:3px}
        #cdk-console-log{font-size:10px;font-family:Consolas,monospace;color:#333;max-height:300px;overflow-y:auto;background:#1e1e1e;color:#d4d4d4;padding:8px;border-radius:4px;line-height:1.6}
        #cdk-console-log .log-info{color:#4FC1FF}#cdk-console-log .log-warn{color:#CCA700}#cdk-console-log .log-error{color:#F44336}#cdk-console-log .log-success{color:#4CAF50}#cdk-console-log .log-time{color:#888;margin-right:4px}
        #cdk-console-ctrls{display:flex;gap:6px;margin-bottom:6px;flex-wrap:wrap;align-items:center}
        #cdk-console-ctrls label{font-size:11px;color:#666;display:flex;align-items:center;gap:3px}
        #cdk-console-ctrls input[type="checkbox"]{margin:0}
        #cdk-console-filter{font-size:11px;padding:2px 6px;border:1px solid #ddd;border-radius:3px;width:120px}
    `;
    const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);

    // 触发器
    const trigger = document.createElement('div');
    trigger.id = 'cdk-trigger'; trigger.innerHTML = 'CDK<br>提醒';
    document.body.appendChild(trigger);

    // 面板
    const panel = document.createElement('div');
    panel.id = 'cdk-panel';
    panel.innerHTML = `
        <div id="cdk-header">
            <span>CDK 自动领取 <span id="cdk-version">v${VERSION}</span></span>
            <div id="cdk-ctrls">
                <button id="cdk-pin" title="固定">📌</button>
                <button id="cdk-close" title="关闭">×</button>
            </div>
        </div>
        <div id="cdk-body">
            <div class="cdk-notice">
                <b>💡 扫描默认关闭</b>
                可手动扫描，或输入秒数后点击「开始自动」。<br>
                到点自动跳转并点击「立即领取」。hCaptcha需手动验证。
            </div>
            <div id="cdk-update-box"></div>
            <div id="cdk-tabs">
                <div class="cdk-tab active" data-tab="scan">🔍 扫描结果</div>
                <div class="cdk-tab" data-tab="list">📋 我的提醒</div>
                <div class="cdk-tab" data-tab="console">🖥️ 控制台</div>
                <div class="cdk-tab" data-tab="add">➕ 手动添加</div>
            </div>
            <div class="cdk-tab-content active" data-tab="scan">
                <div id="cdk-scan-status"><span id="cdk-scan-dot"></span> 等待首次扫描... <span id="cdk-scan-time"></span></div>
                <div class="cdk-sort-bar">
                    <label>排序:</label>
                    <select id="cdk-sort-mode">
                        <option value="cdk-asc" ${GM_getValue('cdk_sort_mode', 'cdk-asc') === 'cdk-asc' ? 'selected' : ''}>CDK时间 ↑</option>
                        <option value="cdk-desc" ${GM_getValue('cdk_sort_mode', 'cdk-asc') === 'cdk-desc' ? 'selected' : ''}>CDK时间 ↓</option>
                        <option value="post-asc" ${GM_getValue('cdk_sort_mode', 'cdk-asc') === 'post-asc' ? 'selected' : ''}>发帖时间 ↑</option>
                        <option value="post-desc" ${GM_getValue('cdk_sort_mode', 'cdk-asc') === 'post-desc' ? 'selected' : ''}>发帖时间 ↓</option>
                        <option value="found-desc" ${GM_getValue('cdk_sort_mode', 'cdk-asc') === 'found-desc' ? 'selected' : ''}>发现时间 ↓</option>
                        <option value="found-asc" ${GM_getValue('cdk_sort_mode', 'cdk-asc') === 'found-asc' ? 'selected' : ''}>发现时间 ↑</option>
                    </select>
                    <button class="cdk-btn-sm orange" id="cdk-scan-manual">手动扫描</button>
                    <button class="cdk-btn-sm" id="cdk-scan-toggle" style="background:#4CAF50">开始自动</button>
                    <input type="text" id="cdk-scan-interval" value="${Math.floor(CFG.scanInterval/1000)}" style="width:40px;padding:2px 4px;font-size:11px;border:1px solid #ddd;border-radius:3px;text-align:center" placeholder="秒"> <span style="font-size:11px;color:#888">秒</span>
                </div>
                <div id="cdk-scan-log"></div>
                <div id="cdk-scan-list"><div class="cdk-empty">扫描中...</div></div>
            </div>
            <div class="cdk-tab-content" data-tab="list">
                <div id="cdk-list"></div>
            </div>
            <div class="cdk-tab-content" data-tab="console">
                <div id="cdk-console-ctrls">
                    <button class="cdk-btn-sm" id="cdk-console-clear">清空</button>
                    <button class="cdk-btn-sm orange" id="cdk-console-export">导出日志</button>
                    <input type="text" id="cdk-console-filter" placeholder="过滤关键词...">
                    <label><input type="checkbox" id="cdk-console-auto-scroll" checked> 自动滚动</label>
                </div>
                <div id="cdk-console-log"></div>
            </div>
            <div class="cdk-tab-content" data-tab="add">
                <div class="cdk-fg"><label>CDK 名称</label><input type="text" id="cdk-name" placeholder="例如：Cursor Pro Token"></div>
                <div class="cdk-fg"><label>CDK 地址</label><input type="text" id="cdk-url" placeholder="https://cdk.linux.do/receive/*****"></div>
                <div class="cdk-fg"><label>开始时间</label><input type="text" id="cdk-time" placeholder="2025/10/22 17:00:00"><div class="cdk-hint">格式：年/月/日 时:分:秒</div></div>
                <div class="cdk-fg"><label><input type="checkbox" id="cdk-auto" checked> 自动跳转并领取</label></div>
                <div class="cdk-fg"><label>提前跳转(秒)</label><input type="text" id="cdk-presec" value="5"></div>
                <button class="cdk-btn" id="cdk-add">添加提醒</button>
            </div>
        </div>
    `;
    document.body.appendChild(panel);

    // ===== 面板交互 =====
    let hideTimer = null;
    let pinned = GM_getValue('cdk_pinned', false);
    const pinBtn = document.getElementById('cdk-pin');
    if (pinned) { panel.classList.add('show'); pinBtn.classList.add('pinned'); }
    pinBtn.addEventListener('click', () => {
        pinned = !pinned; GM_setValue('cdk_pinned', pinned);
        if (pinned) { pinBtn.classList.add('pinned'); panel.classList.add('show'); }
        else { pinBtn.classList.remove('pinned'); }
    });
    trigger.addEventListener('mouseenter', () => { clearTimeout(hideTimer); panel.classList.add('show'); });
    panel.addEventListener('mouseenter', () => { clearTimeout(hideTimer); panel.classList.add('show'); });
    trigger.addEventListener('mouseleave', () => { if (pinned) return; hideTimer = setTimeout(() => { if (!panel.matches(':hover')) panel.classList.remove('show'); }, 300); });
    panel.addEventListener('mouseleave', () => { if (pinned) return; hideTimer = setTimeout(() => panel.classList.remove('show'), 300); });
    document.getElementById('cdk-close').addEventListener('click', () => {
        panel.classList.remove('show');
        if (pinned) { pinned = false; GM_setValue('cdk_pinned', false); pinBtn.classList.remove('pinned'); }
    });

    // Tab切换
    document.querySelectorAll('.cdk-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.cdk-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.cdk-tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            document.querySelector(`.cdk-tab-content[data-tab="${tab.dataset.tab}"]`).classList.add('active');
        });
    });

    // ===== 工具函数 =====
    function escHtml(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }
    function fmtCD(ms) {
        if (ms <= 0) return '⏰ 时间已到！';
        const s = Math.floor(ms/1000), m = Math.floor(s/60), h = Math.floor(m/60), d = Math.floor(h/24);
        if (d > 0) return `${d}天 ${h%24}时 ${m%60}分 ${s%60}秒`;
        if (h > 0) return `${h}时 ${m%60}分 ${s%60}秒`;
        if (m > 0) return `${m}分 ${s%60}秒`;
        return `${s}秒`;
    }
    function parseTime(s) {
        const m = s.trim().match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})\s+(\d{1,2})[:：](\d{1,2})(?:[:：](\d{1,2}))?$/);
        if (!m) return null;
        const d = new Date(+m[1], +m[2]-1, +m[3], +m[4], +m[5], +(m[6]||0));
        return isNaN(d.getTime()) ? null : d;
    }
    function extractTime(text) {
        const m = text.match(/(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})\s+(\d{1,2})[:：](\d{1,2})(?:[:：](\d{1,2}))?/);
        if (m) {
            const d = new Date(+m[1], +m[2]-1, +m[3], +m[4], +m[5], +(m[6]||0));
            if (!isNaN(d.getTime()) && d > Date.now()) return d;
        }
        const t = text.match(/(\d{1,2})[:：](\d{1,2})(?:[:：](\d{1,2}))?/);
        if (t) {
            const now = new Date();
            const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), +t[1], +t[2], +(t[3]||0));
            if (d <= now) d.setDate(d.getDate() + 1);
            return d;
        }
        return null;
    }
    function cmpVer(a,b) {
        const x=a.split('.').map(Number), y=b.split('.').map(Number);
        for (let i=0;i<Math.max(x.length,y.length);i++) if ((x[i]||0)!==(y[i]||0)) return (x[i]||0)-(y[i]||0);
        return 0;
    }
    async function checkUpdate() {
        try {
            const resp = await fetch(UPDATE_URL + '?t=' + Date.now(), {cache:'no-store'});
            const text = await resp.text();
            const m = text.match(/\/\/\s*@version\s+([\d.]+)/);
            if (!m || cmpVer(m[1], VERSION) <= 0) return;
            const box = document.getElementById('cdk-update-box');
            if (box) { box.style.display = 'block'; box.innerHTML = `发现新版 v${m[1]}，当前 v${VERSION}。<a href="${UPDATE_URL}" target="_blank">点击更新脚本</a>`; }
            consoleLog(`发现新版 v${m[1]}，当前 v${VERSION}`, 'warn');
        } catch(e) { consoleLog(`检查更新失败: ${e.message}`, 'warn'); }
    }

    // ===== 数据管理 =====
    class ReminderMgr {
        constructor() {
            this.list = JSON.parse(GM_getValue('cdk_reminders', '[]'));
            this.opened = new Set();
            this.knownUrls = new Set(this.list.map(r => r.url));
        }
        save() { GM_setValue('cdk_reminders', JSON.stringify(this.list)); this.knownUrls = new Set(this.list.map(r => r.url)); }
        add(n, u, t, a, p) {
            if (this.knownUrls.has(u)) return false;
            this.list.push({id:Date.now(), name:n, url:u, time:t, autoJump:a, preSec:p||5, created:Date.now()});
            this.save(); return true;
        }
        del(id) { this.list = this.list.filter(r => r.id !== id); this.save(); }
        active() { return this.list.filter(r => r.time > Date.now()); }
        hasUrl(u) { return this.knownUrls.has(u); }
        clean() { const b = this.list.length; this.list = this.list.filter(r => r.time > Date.now()); if (this.list.length !== b) this.save(); }
    }
    const mgr = new ReminderMgr();

    // ===== 扫描器 =====
    let scanResults = [];
    let scanPending = false;
    let scanCount = 0;

    // ===== 控制台日志系统 =====
    const consoleLogs = [];
    const LOG_MAX = 500;
    const logLevels = {info:'log-info', warn:'log-warn', error:'log-error', success:'log-success'};

    function consoleLog(msg, level='info') {
        const ts = new Date().toLocaleTimeString('zh-CN');
        const entry = {ts, msg, level};
        consoleLogs.push(entry);
        if (consoleLogs.length > LOG_MAX) consoleLogs.shift();
        renderConsoleLog(entry);
        // 同步到浏览器控制台
        const fn = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
        console[fn](`[CDK ${ts}] ${msg}`);
    }

    function renderConsoleLog(entry) {
        const el = document.getElementById('cdk-console-log');
        if (!el) return;
        const cls = logLevels[entry.level] || 'log-info';
        const div = document.createElement('div');
        div.dataset.level = entry.level;
        div.innerHTML = `<span class="log-time">[${entry.ts}]</span><span class="${cls}">${escHtml(entry.msg)}</span>`;
        // 过滤
        const filter = document.getElementById('cdk-console-filter')?.value?.trim().toLowerCase();
        if (filter && !entry.msg.toLowerCase().includes(filter)) div.style.display = 'none';
        el.appendChild(div);
        const autoScroll = document.getElementById('cdk-console-auto-scroll');
        if (!autoScroll || autoScroll.checked) el.scrollTop = el.scrollHeight;
    }

    function renderAllConsoleLogs() {
        const el = document.getElementById('cdk-console-log');
        if (!el) return;
        const filter = document.getElementById('cdk-console-filter')?.value?.trim().toLowerCase();
        el.innerHTML = consoleLogs.map(e => {
            const cls = logLevels[e.level] || 'log-info';
            const hidden = filter && !e.msg.toLowerCase().includes(filter) ? ' style="display:none"' : '';
            return `<div data-level="${e.level}"${hidden}><span class="log-time">[${e.ts}]</span><span class="${cls}">${escHtml(e.msg)}</span></div>`;
        }).join('');
        el.scrollTop = el.scrollHeight;
    }

    // 控制台按钮事件
    document.getElementById('cdk-console-clear')?.addEventListener('click', () => {
        consoleLogs.length = 0;
        const el = document.getElementById('cdk-console-log');
        if (el) el.innerHTML = '';
    });
    document.getElementById('cdk-console-export')?.addEventListener('click', () => {
        const text = consoleLogs.map(e => `[${e.ts}] [${e.level.toUpperCase()}] ${e.msg}`).join('\n');
        const blob = new Blob([text], {type:'text/plain'});
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `cdk-log-${new Date().toISOString().slice(0,10)}.txt`;
        a.click();
        URL.revokeObjectURL(a.href);
    });
    document.getElementById('cdk-console-filter')?.addEventListener('input', renderAllConsoleLogs);

    function log(msg) {
        const el = document.getElementById('cdk-scan-log');
        if (el) { el.style.display = 'block'; el.innerHTML += `<div>${msg}</div>`; el.scrollTop = el.scrollHeight; }
        consoleLog(msg, 'info');
    }

    function setStatus(msg) {
        const el = document.getElementById('cdk-scan-status');
        if (el) el.innerHTML = `<span id="cdk-scan-dot"></span> ${msg} <span id="cdk-scan-time">${new Date().toLocaleTimeString('zh-CN')}</span>`;
    }

    // 从文本中提取CDK链接
    function extractCDKs(text, title) {
        if (!text) return [];
        const urls = text.match(CFG.cdkPattern) || [];
        return [...new Set(urls)].map(url => {
            const id = url.split('/receive/')[1] || '';
            const time = extractTime(text);
            return { url, name: title ? title.slice(0, 50) : `CDK-${id.slice(0,8)}`, time: time ? time.getTime() : null };
        });
    }

    // 添加扫描结果（去重，保留最佳时间）
    function addResult(cdk, source) {
        const exist = scanResults.find(r => r.url === cdk.url);
        if (exist) {
            // 如果新结果有更好的时间信息，更新
            if (!exist.time && cdk.time) exist.time = cdk.time;
            if (!exist.postTime && cdk.postTime) exist.postTime = cdk.postTime;
            if (!exist.topicId && cdk.topicId) exist.topicId = cdk.topicId;
            return;
        }
        if (mgr.hasUrl(cdk.url)) return;
        scanResults.push({...cdk, source, foundAt: Date.now()});
        consoleLog(`发现: ${cdk.name} - ${cdk.url} (${source})`, 'success');
        log(`发现: ${cdk.url} (${source})`);
    }

    // 扫描当前页面DOM
    function scanDOM() {
        const title = document.querySelector('.fancy-title, .topic-title h1, #topic-title')?.textContent || '';
        // 扫描帖子内容
        document.querySelectorAll('.cooked, .post-stream .post').forEach(el => {
            const postEl = el.closest('article') || el.closest('.topic-post') || el.parentElement;
            const postTime = postEl?.querySelector('time')?.getAttribute('datetime') || null;
            extractCDKs(el.innerHTML, title).forEach(cdk => {
                cdk.postTime = postTime;
                addResult(cdk, '页面');
            });
        });
        // 扫描所有链接
        document.querySelectorAll('a[href*="cdk.linux.do/receive/"]').forEach(a => {
            const t = a.closest('.cooked')?.textContent || a.textContent || '';
            const time = extractTime(t);
            const id = a.href.split('/receive/')[1] || '';
            const cdName = title.slice(0,50) || 'CDK-' + id.slice(0,8);
            addResult({url:a.href, name:cdName, time:time?.getTime()||null, postTime:a.closest('article')?.querySelector('time')?.getAttribute('datetime')||null}, '页面链接');
        });
    }

    // fetch封装
    async function safeFetch(url) {
        const resp = await fetch(url, {credentials:'same-origin'});
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return resp.json();
    }

    // 获取话题详情（含帖子发表时间）
    async function fetchTopic(id, title, topicCreatedAt) {
        try {
            const data = await safeFetch(`/t/${id}.json`);
            const posts = (data.post_stream?.posts||[]).slice(0,3);
            let found = 0;
            posts.forEach(p => {
                if (p.cooked) {
                    extractCDKs(p.cooked, title).forEach(cdk => {
                        cdk.postTime = p.created_at || topicCreatedAt || null;
                        cdk.topicId = id;
                        addResult(cdk, '话题详情');
                        found++;
                    });
                }
            });
            if (found) consoleLog(`话题 #${id} "${title}" 发现 ${found} 个CDK`, 'success');
        } catch(e) { consoleLog(`话题 #${id} 请求失败: ${e.message}`, 'warn'); }
    }

    // 主扫描
    async function scanAll() {
        if (scanPending) return;
        scanPending = true;
        scanCount++;
        setStatus(`第${scanCount}次扫描中...`);
        consoleLog(`--- 第${scanCount}次扫描开始 ---`, 'info');

        // 1. 扫描当前页面DOM
        scanDOM();

        // 2. 搜索API
        try {
            consoleLog('请求搜索API...', 'info');
            const data = await safeFetch('/search.json?q=cdk%20order%3Alatest');
            const topics = data.topics || [];
            const posts = data.posts || [];
            consoleLog(`搜索结果: ${topics.length}话题, ${posts.length}帖子`, 'info');
            posts.forEach(p => {
                if (!p.blurb) return;
                const t = topics.find(x => x.id === p.topic_id);
                extractCDKs(p.blurb, t?.title).forEach(cdk => {
                    cdk.postTime = t?.created_at || null;
                    cdk.topicId = p.topic_id;
                    addResult(cdk, '搜索');
                });
            });
            const ids = [...new Set(posts.map(p => p.topic_id))].slice(0, 8);
            for (const id of ids) {
                const t = topics.find(x => x.id === id);
                await fetchTopic(id, t?.title, t?.created_at);
            }
        } catch(e) { consoleLog(`搜索API失败: ${e.message}`, 'error'); log(`搜索失败: ${e.message}`); }

        // 3. 福利板块
        for (const url of ['/c/welfare/36.json', '/c/welfare/welfare-lv2/61.json', '/c/welfare/welfare-lv1/60.json']) {
            try {
                consoleLog(`请求 ${url.split('/').slice(-2).join('/')} ...`, 'info');
                const data = await safeFetch(url);
                const topics = (data.topic_list?.topics) || [];
                consoleLog(`${url.split('/').slice(-2).join('/')}: ${topics.length}话题`, 'info');
                for (const t of topics.slice(0, 5)) {
                    await fetchTopic(t.id, t.fancy_title || t.title, t.created_at);
                }
            } catch(e) { consoleLog(`板块 ${url} 失败: ${e.message}`, 'error'); log(`${url} 失败: ${e.message}`); }
        }

        updateScanUI();
        scanPending = false;
        const summary = `扫描完成 · 当前${scanResults.length}个新CDK · 累计发现${mgr.list.length + scanResults.length}个`;
        setStatus(summary);
        consoleLog(summary, scanResults.length > 0 ? 'success' : 'info');
    }

    // 扫描结果排序
    function getSortFn(mode) {
        switch(mode) {
            case 'cdk-asc':  return (a,b) => (a.time||Infinity) - (b.time||Infinity);
            case 'cdk-desc': return (a,b) => (b.time||0) - (a.time||0);
            case 'post-asc': return (a,b) => (a.postTime?new Date(a.postTime).getTime():Infinity) - (b.postTime?new Date(b.postTime).getTime():Infinity);
            case 'post-desc':return (a,b) => (b.postTime?new Date(b.postTime).getTime():0) - (a.postTime?new Date(a.postTime).getTime():0);
            case 'found-asc':return (a,b) => (a.foundAt||0) - (b.foundAt||0);
            case 'found-desc':return (a,b) => (b.foundAt||0) - (a.foundAt||0);
            default: return (a,b) => (a.time||Infinity) - (b.time||Infinity);
        }
    }

    // 更新扫描结果UI
    function updateScanUI() {
        scanResults = scanResults.filter(r => !mgr.hasUrl(r.url));
        const el = document.getElementById('cdk-scan-list');
        const cnt = document.getElementById('cdk-scan-count');
        if (!scanResults.length) {
            el.innerHTML = '<div class="cdk-empty">暂未发现新CDK</div>';
            if (cnt) cnt.style.display = 'none';
            return;
        }
        if (cnt) { cnt.textContent = scanResults.length; cnt.style.display = 'inline'; }
        const sortMode = document.getElementById('cdk-sort-mode')?.value || 'cdk-asc';
        const sorted = [...scanResults].sort(getSortFn(sortMode));
        el.innerHTML = sorted.map((r, i) => {
            const origIdx = scanResults.indexOf(r);
            const timeStr = r.time ? new Date(r.time).toLocaleString('zh-CN') : '未识别到时间';
            const postStr = r.postTime ? new Date(r.postTime).toLocaleString('zh-CN') : '';
            return `<div class="cdk-scan-item">
                <div class="name">${escHtml(r.name)}</div>
                <div class="url">${escHtml(r.url)}</div>
                <div class="time">⏰ CDK时间: ${timeStr}</div>
                ${postStr ? `<div class="time">📝 发帖时间: ${postStr}</div>` : ''}
                ${r.topicId ? `<div class="time"><a href="https://linux.do/t/${r.topicId}" target="_blank" style="color:#2196F3;text-decoration:underline">🔗 查看帖子</a></div>` : ''}
                <div class="actions">
                    <button class="cdk-btn-sm cdk-add-btn" data-i="${origIdx}">一键添加</button>
                    <button class="cdk-btn-sm" style="background:#999" onclick="this.closest('.cdk-scan-item').remove()">忽略</button>
                </div>
            </div>`;
        }).join('');
        el.querySelectorAll('.cdk-add-btn').forEach(btn => {
            btn.addEventListener('click', e => {
                const r = scanResults[+e.target.dataset.i];
                if (!r) return;
                if (!r.time) {
                    const input = prompt(`请输入开始时间\n格式：2025/10/22 17:00:00\n\n${r.name}`);
                    if (!input) return;
                    const p = parseTime(input);
                    if (!p) { alert('格式错误'); return; }
                    r.time = p.getTime();
                }
                if (mgr.add(r.name, r.url, r.time, true, CFG.preJumpSec)) {
                    scanResults.splice(+e.target.dataset.i, 1);
                    updateScanUI(); renderList();
                    alert(`已添加: ${r.name}`);
                } else {
                    alert('已在列表中');
                }
            });
        });
    }

    // ===== 渲染提醒列表 =====
    function renderList() {
        const el = document.getElementById('cdk-list');
        const active = mgr.active();
        if (!active.length) { el.innerHTML = '<div class="cdk-empty">暂无提醒</div>'; return; }
        el.innerHTML = active.map(r => {
            const diff = r.time - Date.now();
            const cls = diff <= 30000 ? 'danger' : diff <= 300000 ? 'warn' : '';
            return `<div class="cdk-item" data-id="${r.id}">
                <button class="cdk-item-del" data-id="${r.id}">删除</button>
                <div class="cdk-item-name" data-url="${escHtml(r.url)}">${escHtml(r.name)}</div>
                <div class="cdk-item-time">⏰ ${new Date(r.time).toLocaleString('zh-CN')}</div>
                <div class="cdk-item-cd ${cls}">${fmtCD(diff)}</div>
                ${r.autoJump ? `<div class="cdk-item-auto">✓ 自动跳转 (提前${r.preSec||5}秒)</div>` : ''}
            </div>`;
        }).join('');
        el.querySelectorAll('.cdk-item-del').forEach(b => b.addEventListener('click', e => { if (confirm('删除？')) { mgr.del(+e.target.dataset.id); renderList(); } }));
        el.querySelectorAll('.cdk-item-name').forEach(n => n.addEventListener('click', e => window.open(e.target.dataset.url, '_blank')));
    }

    // ===== 手动添加 =====
    document.getElementById('cdk-add').addEventListener('click', () => {
        const name = document.getElementById('cdk-name').value.trim();
        const url = document.getElementById('cdk-url').value.trim();
        const timeStr = document.getElementById('cdk-time').value.trim();
        const auto = document.getElementById('cdk-auto').checked;
        const preSec = parseInt(document.getElementById('cdk-presec').value) || 5;
        if (!name||!url||!timeStr) { alert('请填写完整'); return; }
        const parsed = parseTime(timeStr);
        if (!parsed) { alert('时间格式错误'); return; }
        if (parsed.getTime() <= Date.now() && !confirm('时间已过，确定？')) return;
        if (mgr.add(name, url, parsed.getTime(), auto, preSec)) {
            ['cdk-name','cdk-url','cdk-time'].forEach(id => document.getElementById(id).value = '');
            renderList(); alert('添加成功！');
            document.querySelector('.cdk-tab[data-tab="list"]').click();
        } else { alert('已在列表中'); }
    });

    // ===== 自动跳转 =====
    function checkJump() {
        const now = Date.now();
        mgr.active().forEach(r => {
            if (!r.autoJump) return;
            const diff = r.time - now;
            const preMs = (r.preSec||5)*1000;
            const key = `${r.id}_${r.url}`;
            if (diff <= preMs && diff > 0 && !mgr.opened.has(key)) {
                const w = window.open(r.url, '_blank');
                mgr.opened.add(key);
                if (!w || w.closed) {
                    if (Notification.permission === 'granted') new Notification('CDK', {body:`${r.name} 弹窗被拦截`, icon:'https://linux.do/favicon.ico'});
                }
            }
        });
    }

    // 通知权限
    if (Notification.permission === 'default') {
        document.addEventListener('click', function r() { Notification.requestPermission(); document.removeEventListener('click', r); }, {once:true});
    }

    // ===== 手动扫描按钮 =====
    document.getElementById('cdk-scan-manual').addEventListener('click', () => {
        scanAll();
    });

    // ===== 排序切换 =====
    document.getElementById('cdk-sort-mode')?.addEventListener('change', e => { GM_setValue('cdk_sort_mode', e.target.value); updateScanUI(); });

    // ===== 主循环 =====
    renderList();
    let scanIntervalId = null;
    let scanRunning = false;
    const scanToggleBtn = document.getElementById('cdk-scan-toggle');
    setStatus('等待手动开启扫描');
    setInterval(() => { renderList(); checkJump(); mgr.clean(); }, 1000);

    // 开始/停止自动扫描
    scanToggleBtn?.addEventListener('click', () => {
        scanRunning = !scanRunning;
        if (scanRunning) {
            const sec = Math.max(5, parseInt(document.getElementById('cdk-scan-interval')?.value) || 60);
            CFG.scanInterval = sec * 1000;
            GM_setValue('cdk_scan_interval', sec);
            document.getElementById('cdk-scan-interval').value = sec;
            scanAll();
            scanIntervalId = setInterval(scanAll, CFG.scanInterval);
            scanToggleBtn.textContent = '停止自动';
            scanToggleBtn.style.background = '#F44336';
            consoleLog(`自动扫描已开启，间隔${sec}秒`, 'success');
        } else {
            if (scanIntervalId) { clearInterval(scanIntervalId); scanIntervalId = null; }
            scanToggleBtn.textContent = '开始自动';
            scanToggleBtn.style.background = '#4CAF50';
            consoleLog('自动扫描已停止', 'warn');
            setStatus('扫描已停止');
        }
    });

    consoleLog(`CDK Auto v${VERSION} 已加载`, 'success');
    consoleLog(`扫描间隔: ${CFG.scanInterval/1000}秒 | 提前跳转: ${CFG.preJumpSec}秒`, 'info');
    setTimeout(checkUpdate, 3000);
})();
