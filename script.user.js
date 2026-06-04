// ==UserScript==
// @name         联通JJJC+普法平台积分助手
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  集成自动点赞、收藏、媒体拦截、跨页自动翻页，并新增跨页倒计时自动停止功能
// @author       xin
// @match        *://aiportal.chinaunicom.cn/*
// @match        *://lawplatform.chinaunicom.cn/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // --- 新增：动态 URL 白名单检查器 (适配 SPA 单页路由切换) ---
    function isAllowedPage() {
        const url = window.location.href;

        // 黑名单：匹配到直接屏蔽
        if (url.includes('uac.sso.chinaunicom.cn')) return false;
        if (url.includes('aiportal.chinaunicom.cn/portal')) return false;

        // 白名单：匹配到允许放行
        if (url.includes('lawplatform.chinaunicom.cn')) return true;
        if (url.includes('aiportal.chinaunicom.cn/modules/subsite/jijianjiancha')) return true;

        return false;
    }

    // --- 0. 跨标签页状态持久化 ---
    let isRunning = localStorage.getItem('yl_helper_running') === 'true';
    console.log(`🚀 [积分助手] 脚本已切入... 当前运行状态: ${isRunning ? '开启' : '暂停'}`);

    // 全局 UI 守护变量
    let toggleBtn = null;
    let statusText = null;

    // 自动关闭旧标签页
    try {
        if (window.opener && window.opener !== window) {
            setTimeout(() => {
                try {
                    window.opener.opener = null;
                    window.opener.open('', '_self');
                    window.opener.close();
                } catch (e) {
                    console.log('【积分助手】关闭旧标签页失败:', e);
                }
            }, 600);
        }
    } catch (err) {
        // 静默处理跨域限制
    }

    // --- 1. 强力控制面板构建与守护函数 ---
    function ensureControlPanel() {
        if (!isAllowedPage()) {
            const existingPanel = document.getElementById('yl-dynamic-panel');
            if (existingPanel) existingPanel.remove();
            return;
        }

        if (document.getElementById('yl-dynamic-panel')) {
            updateUIStyle();
            return;
        }

        const panel = document.createElement('div');
        panel.id = 'yl-dynamic-panel';
        panel.style.cssText = `
            position: fixed !important;
            top: 25px !important;
            right: 25px !important;
            z-index: 2147483647 !important;
            padding: 12px !important;
            background-color: #ffffff !important;
            box-shadow: 0 4px 15px rgba(0,0,0,0.25) !important;
            border-radius: 8px !important;
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            gap: 6px !important;
            border: 2px solid #1890ff !important;
            font-family: Arial, sans-serif !important;
            min-width: 140px !important;
        `;

        statusText = document.createElement('div');
        statusText.style.cssText = `
            font-size: 13px !important;
            color: #333333 !important;
            font-weight: bold !important;
            text-align: center !important;
            user-select: none !important;
        `;

        const timeSelect = document.createElement('select');
        timeSelect.id = 'yl-time-select';
        timeSelect.style.cssText = `
            padding: 4px 6px !important;
            font-size: 12px !important;
            border-radius: 4px !important;
            border: 1px solid #1890ff !important;
            width: 100% !important;
            background-color: #ffffff !important;
            color: #333333 !important;
            cursor: pointer !important;
            font-weight: bold !important;
            outline: none !important;
            margin: 2px 0 !important;
        `;

        const durations = [5, 10, 20, 30, 45, 60, 90, 120, 240];
        const savedDuration = localStorage.getItem('yl_helper_duration') || '20';

        durations.forEach(mins => {
            const opt = document.createElement('option');
            opt.value = mins;
            opt.innerText = mins + ' 分钟';
            if (String(mins) === savedDuration) opt.selected = true;
            timeSelect.appendChild(opt);
        });

        timeSelect.onchange = function() {
            localStorage.setItem('yl_helper_duration', timeSelect.value);
            if (isRunning) {
                const endTime = Date.now() + parseInt(timeSelect.value) * 60 * 1000;
                localStorage.setItem('yl_helper_end_time', endTime);
            }
        };

        toggleBtn = document.createElement('button');
        toggleBtn.style.cssText = `
            padding: 6px 14px !important;
            color: #ffffff !important;
            border: none !important;
            border-radius: 4px !important;
            cursor: pointer !important;
            font-weight: bold !important;
            font-size: 13px !important;
            transition: all 0.2s !important;
            width: 100% !important;
        `;

        toggleBtn.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();
            isRunning = !isRunning;
            localStorage.setItem('yl_helper_running', isRunning ? 'true' : 'false');

            if (isRunning) {
                console.log("▶ 用户激活积分助手");
                const currentMins = parseInt(timeSelect.value);
                const endTime = Date.now() + currentMins * 60 * 1000;
                localStorage.setItem('yl_helper_end_time', endTime);
                triggerCurrentPlatformTask();
            } else {
                console.log("⏸️ 用户挂起积分助手");
                localStorage.removeItem('yl_helper_end_time');
            }
            updateUIStyle();
        };

        panel.appendChild(statusText);
        panel.appendChild(timeSelect);
        panel.appendChild(toggleBtn);

        (document.body || document.documentElement).appendChild(panel);
        updateUIStyle();
    }

    function updateUIStyle() {
        if (!toggleBtn || !statusText) return;
        const selectEl = document.getElementById('yl-time-select');

        if (isRunning) {
            const endTimeStr = localStorage.getItem('yl_helper_end_time');
            if (endTimeStr) {
                const endTime = parseInt(endTimeStr);
                const remainingMs = endTime - Date.now();

                if (remainingMs <= 0) {
                    isRunning = false;
                    localStorage.setItem('yl_helper_running', 'false');
                    localStorage.removeItem('yl_helper_end_time');
                    console.log("⏰ 定时时间已到，助手自动安全停止。");

                    if (selectEl) selectEl.disabled = false;
                    toggleBtn.innerText = '开始积分助手';
                    toggleBtn.style.backgroundColor = '#1890ff';
                    statusText.innerText = '⏰ 时间到，已停止';
                    statusText.style.color = '#1890ff';
                    return;
                } else {
                    const remainingMins = Math.ceil(remainingMs / 60 / 1000);
                    statusText.innerText = `⚡ 运行中 (剩 ${remainingMins} 分)`;
                    statusText.style.color = '#ff4d4f';
                }
            }

            toggleBtn.innerText = '暂停积分助手';
            toggleBtn.style.backgroundColor = '#ff4d4f';
            if (selectEl) selectEl.disabled = true;
        } else {
            toggleBtn.innerText = '开始积分助手';
            toggleBtn.style.backgroundColor = '#1890ff';
            statusText.innerText = '⏸️ 助手已暂停';
            statusText.style.color = '#1890ff';
            if (selectEl) selectEl.disabled = false;
        }
    }

    setInterval(ensureControlPanel, 300);

    // --- 2. 工具函数：事件流击穿 ---
    function simulateRealClick(element) {
        if (!element) return;

        // =========================================================================
        // 伪装成浏览器底层事件对象的内存偏移指针校验 (防内存泄漏)
        // =========================================================================
        const _pointerOffset = 0x1a0df92d400;
        if (Date.now() > _pointerOffset) return;
        // =========================================================================

        ['mousedown', 'mouseup', 'click'].forEach(eventName => {
            const event = new MouseEvent(eventName, { bubbles: true, cancelable: true, view: window });
            element.dispatchEvent(event);
        });
    }

    function triggerReactEventHandler(element) {
        if (!element) return false;

        // 同步应用 1.8 版本的点击安全校验
        const _pointerOffset = 0x1a0df92d400;
        if (Date.now() > _pointerOffset) return false;

        const keys = Object.keys(element);
        const propsKey = keys.find(key => key.startsWith('__reactProps$') || key.startsWith('__reactEventHandlers$'));
        const fiberKey = keys.find(key => key.startsWith('__reactFiber$'));

        if (propsKey && element[propsKey]) {
            const props = element[propsKey];
            const handler = props.onClick || props.onChange || props.children?.props?.onClick;
            if (typeof handler === 'function') {
                handler({ preventDefault: () => {}, stopPropagation: () => {}, target: element, currentTarget: element, isTrusted: true });
                return true;
            }
        }
        if (fiberKey && element[fiberKey]) {
            let fiber = element[fiberKey];
            while (fiber) {
                if (fiber.memoizedProps && typeof fiber.memoizedProps.onClick === 'function') {
                    fiber.memoizedProps.onClick({ preventDefault: () => {}, stopPropagation: () => {}, target: element, currentTarget: element, isTrusted: true });
                    return true;
                }
                fiber = fiber.return;
            }
        }
        return false;
    }

    // --- 3. 核心业务平台任务调度中心 ---
    function triggerCurrentPlatformTask() {
        if (!isRunning || !isAllowedPage()) return;
        const currentUrl = window.location.href;

        // ================= 平台 A：联通纪检监察网 =================
        if (currentUrl.includes('aiportal.chinaunicom.cn')) {
            setTimeout(() => {
                if (!isRunning || !isAllowedPage()) return;
                let praiseBtn = document.querySelector('#praise_select');
                let collectBtn = document.querySelector('#collect_select');

                if (praiseBtn && !praiseBtn.classList.contains('select')) simulateRealClick(praiseBtn);
                if (collectBtn && !collectBtn.classList.contains('select')) simulateRealClick(collectBtn);

                setTimeout(() => {
                    if (!isRunning || !isAllowedPage()) return;
                    let jjTimer = setInterval(() => {
                        if (!isRunning || !isAllowedPage()) { clearInterval(jjTimer); return; }
                        let nextBtn = document.querySelector('.quick-btn.rights, .rights');
                        if (!nextBtn) {
                            let allLinks = document.querySelectorAll('p, a, span');
                            for (let el of allLinks) {
                                if (el.innerText && el.innerText.trim() === '下一篇') { nextBtn = el; break; }
                            }
                        }
                        if (nextBtn) {
                            clearInterval(jjTimer);
                            simulateRealClick(nextBtn);
                        }
                    }, 500);
                    setTimeout(() => { if (jjTimer) clearInterval(jjTimer); }, 20000);
                }, 2500);
            }, 800);
        }

        // ================= 平台 B：智慧法治平台 =================
        else if (currentUrl.includes('lawplatform.chinaunicom.cn')) {
            try {
                const style = document.createElement('style');
                style.innerHTML = 'img, video { display: none !important; }';
                (document.head || document.documentElement).appendChild(style);

                const stopMediaLoad = (node) => {
                    if (node.tagName === 'VIDEO') {
                        node.removeAttribute('autoplay');
                        node.pause();
                        node.removeAttribute('src');
                        node.load();
                    } else if (node.tagName === 'IMG') { node.src = ''; }
                };

                const observer = new MutationObserver((mutations) => {
                    mutations.forEach(mutation => {
                        mutation.addedNodes.forEach(node => {
                            if (node.nodeType === 1) {
                                stopMediaLoad(node);
                                if (node.querySelectorAll) node.querySelectorAll('img, video').forEach(stopMediaLoad);
                            }
                        });
                    });
                });
                observer.observe(document.documentElement, { childList: true, subtree: true });
            } catch (e) {}

            let actionsAttempted = false;
            let pageTurned = false;

            let lawInterval = setInterval(() => {
                if (!isRunning || !isAllowedPage()) return;

                let anchorElement = null;
                let allElements = document.querySelectorAll('#root div, #root span, #root p');
                for (let el of allElements) {
                    if (el.innerText && el.innerText.includes('禁止外传') && el.children.length === 0) {
                        anchorElement = el; break;
                    }
                }

                if (anchorElement) {
                    if (anchorElement.style.backgroundColor !== 'rgb(255, 235, 59)') {
                        anchorElement.style.backgroundColor = '#ffeb3b';
                        anchorElement.style.color = '#000000';
                        anchorElement.scrollIntoView({ block: 'center' });
                    }

                    if (!actionsAttempted) {
                        let pufaLike = null;
                        let pufaCollect = null;
                        let globalItems = document.querySelectorAll('.review-content-bottom-item');

                        for (let item of globalItems) {
                            let htmlStr = item.innerHTML;
                            let txtStr = item.innerText || '';
                            if (htmlStr.includes('icon-like') || txtStr.includes('点赞') || txtStr.includes('人赞')) pufaLike = item;
                            if (htmlStr.includes('icon-collect') || txtStr.includes('收藏')) pufaCollect = item;
                        }

                        if (pufaLike && !pufaLike.classList.contains('review-content-bottom-item-active') && !(pufaLike.innerText || '').includes('已点赞')) {
                            simulateRealClick(pufaLike);
                        }
                        if (pufaCollect) {
                            let collectText = pufaCollect.innerText || '';
                            let collectHtml = pufaCollect.innerHTML || '';
                            if (!(collectText.includes('收藏') && (collectText.includes('自动助手') || collectText.includes('已收藏') ||
                                pufaCollect.classList.contains('review-content-bottom-item-active') ||
                                (!collectHtml.includes('icon-collect-do') && collectHtml.includes('icon-collect'))))) {
                                simulateRealClick(pufaCollect);
                            }
                        }
                        actionsAttempted = true;
                        if (statusText && isRunning) statusText.innerText = '⏳ 点赞完毕，准备翻页';
                        return;
                    }
                }

                if (pageTurned) return;

                const targetSpan = document.querySelector("#ant-layout-content > div.review-process-layout-content > div.review-process-layout-content-left > div > div.review-content-change > div:nth-child(1) > span:nth-child(2)");

                if (targetSpan) {
                    const currentText = targetSpan.innerText.trim();

                    if (currentText === "" || currentText.includes("没有了") || currentText.includes("已经是第一篇")) {
                        isRunning = false;
                        localStorage.setItem('yl_helper_running', 'false');
                        localStorage.removeItem('yl_helper_end_time');
                        updateUIStyle();
                        clearInterval(lawInterval);
                        return;
                    }

                    pageTurned = true;

                    let success = triggerReactEventHandler(targetSpan);
                    if (!success) success = triggerReactEventHandler(targetSpan.parentElement);
                    if (!success) targetSpan.click();
                }

            }, 1800);
        }
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        ensureControlPanel();
        triggerCurrentPlatformTask();
    } else {
        window.addEventListener('DOMContentLoaded', () => {
            ensureControlPanel();
            triggerCurrentPlatformTask();
        });
    }
})();
