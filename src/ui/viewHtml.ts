// 面板 HTML 骨架：样式与脚本从 dist 引入，nonce 按 CSP 要求逐次随机生成
import * as vscode from "vscode";
import * as crypto from "crypto";

export function buildPanelHtml(
  webview: vscode.Webview,
  distUri: vscode.Uri,
): string {
  const nonce = crypto.randomBytes(16).toString("base64url");
  const script = webview.asWebviewUri(
    vscode.Uri.joinPath(distUri, "webview.js"),
  );
  const style = webview.asWebviewUri(
    vscode.Uri.joinPath(distUri, "webview-style.css"),
  );
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<link rel="stylesheet" href="${style}">
</head>
<body>
<div class="bar">
<span class="tab" data-tab="mine">自选</span>
<span class="tab" data-tab="index">指数</span>
<span class="tab" data-tab="sector">板块</span>
<span class="tab" data-tab="rank">排行</span>
<span class="time" id="time"></span>
<span class="refresh" title="刷新">↻</span>
<span class="subtabs">
<span class="subtab active" data-dir="up">涨幅榜</span>
<span class="subtab" data-dir="down">跌幅榜</span>
<span class="subtab" data-dir="inflow">流入榜</span>
<span class="subtab" data-dir="outflow">流出榜</span>
</span>
</div>
<div id="content"></div>
<script nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
}
