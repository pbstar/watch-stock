/**
 * 分时图渲染模块（IIFE 封装）
 * 注入到 stockHome.html 的 <script nonce> 块中，
 * 闭包访问外层已定义的 DOM 引用（chartSvg/volSvg 等）和工具函数（fmtVol）。
 *
 * 公共 API：
 *   StockChart.render(minuteData, activeInfo)  渲染分时图 + 成交量
 *   StockChart.hide()                          隐藏十字线
 */
const StockChart = (() => {
  /* ---- 颜色常量 ---- */
  const C_UP = "#c94c4c";
  const C_DN = "#2d8a2d";
  const C_GRID = "rgba(128,128,128,0.18)";
  const C_BDR = "rgba(128,128,128,0.3)";
  const C_AXIS = "var(--vscode-descriptionForeground,#888)";
  const NS = "http://www.w3.org/2000/svg";

  /* ---- 十字线私有状态 ---- */
  let chEls = null;

  function _ensureChEls() {
    if (chEls) return chEls;
    const mkLine = (parent) => {
      const l = document.createElementNS(NS, "line");
      l.setAttribute("stroke", "rgba(140,140,140,0.5)");
      l.setAttribute("stroke-width", "1");
      l.setAttribute("stroke-dasharray", "3,3");
      l.classList.add("ch");
      parent.appendChild(l);
      return l;
    };
    const dot = document.createElementNS(NS, "circle");
    dot.setAttribute("r", "4");
    dot.classList.add("ch");
    chartSvg.appendChild(dot);
    chEls = {
      vLine: mkLine(chartSvg),
      hLine: mkLine(chartSvg),
      vvLine: mkLine(volSvg),
      dot,
    };
    return chEls;
  }

  /* ---- 公共：隐藏十字线 ---- */
  function hide() {
    if (!chEls) return;
    chEls.vLine.style.display = "none";
    chEls.hLine.style.display = "none";
    chEls.vvLine.style.display = "none";
    chEls.dot.style.display = "none";
  }

  /* ---- 公共：渲染分时图 ---- */
  function render(minuteData, activeInfo) {
    if (!minuteData?.length) {
      placeholder.style.display = "flex";
      placeholder.textContent = minuteData
        ? "暂无分时数据"
        : "正在获取分时数据...";
      chartSvg.innerHTML = "";
      volSvg.innerHTML = "";
      hide();
      return;
    }
    placeholder.style.display = "none";
    const W = chartWrap.clientWidth || 600,
      H = chartWrap.clientHeight;
    if (W < 10 || H < 10) return;

    const dec = activeInfo?.isETF ? 3 : 2;
    const preClose =
      activeInfo?.preClose != null
        ? parseFloat(activeInfo.preClose)
        : parseFloat(activeInfo?.current || 0) -
            parseFloat(activeInfo?.changeValue || 0) ||
          minuteData[0]?.price ||
          0;

    const prices = minuteData.map((d) => d.price).filter((p) => p != null);
    if (!prices.length) {
      placeholder.style.display = "flex";
      placeholder.textContent = "暂无分时数据";
      chartSvg.innerHTML = "";
      volSvg.innerHTML = "";
      hide();
      return;
    }
    const lastValidIdx = minuteData.reduce(
      (acc, d, i) => (d.price != null ? i : acc),
      -1,
    );
    const lastPrice = minuteData[lastValidIdx].price;
    const lc = lastPrice >= preClose ? C_UP : C_DN;

    const maxDev =
      Math.max(...prices.map((p) => Math.abs(p - preClose)), preClose * 0.005) *
      1.15;
    const yMin = preClose - maxDev,
      yMax = preClose + maxDev;
    const PAD = { t: 20, r: 58, b: 26, l: 62 };
    const cW = W - PAD.l - PAD.r,
      cH = H - PAD.t - PAD.b;
    const n = minuteData.length;
    const xOf = (i) => PAD.l + (i / Math.max(n - 1, 1)) * cW;
    const yOf = (p) => PAD.t + ((yMax - p) / (yMax - yMin)) * cH;
    const pcY = yOf(preClose),
      bY = (PAD.t + cH).toFixed(1);

    // 将连续非 null 点分段
    const segs = [];
    let seg = [];
    for (let i = 0; i < n; i++) {
      if (minuteData[i].price != null) {
        seg.push(i);
      } else if (seg.length) {
        segs.push(seg);
        seg = [];
      }
    }
    if (seg.length) segs.push(seg);

    const lp = segs
      .map((s) =>
        s
          .map(
            (i, j) =>
              `${j === 0 ? "M" : "L"} ${xOf(i).toFixed(1)},${yOf(minuteData[i].price).toFixed(1)}`,
          )
          .join(" "),
      )
      .join(" ");
    const fp = segs
      .map((s) => {
        const pts = s.map(
          (i) => `${xOf(i).toFixed(1)},${yOf(minuteData[i].price).toFixed(1)}`,
        );
        return `M ${pts[0]} ${pts
          .slice(1)
          .map((p) => `L ${p}`)
          .join(
            " ",
          )} L ${xOf(s[s.length - 1]).toFixed(1)},${bY} L ${xOf(s[0]).toFixed(1)},${bY} Z`;
      })
      .join(" ");

    const yTicks = Array.from({ length: 5 }, (_, i) => {
      const p = yMin + ((yMax - yMin) * i) / 4;
      const pct = ((p - preClose) / preClose) * 100;
      return {
        y: yOf(p),
        price: p.toFixed(dec),
        pct: (pct >= 0 ? "+" : "") + pct.toFixed(2) + "%",
        color: pct > 0.01 ? C_UP : pct < -0.01 ? C_DN : C_AXIS,
      };
    });
    const tMarks = [
      "09:30",
      "10:00",
      "10:30",
      "11:00",
      "11:30",
      "13:30",
      "14:00",
      "14:30",
      "15:00",
    ];
    let ti = 0;
    const xTicks = tMarks
      .map((t) => {
        while (ti < n && minuteData[ti].time.slice(-5) < t) ti++;
        return ti < n ? { label: t, x: xOf(ti) } : null;
      })
      .filter(Boolean);

    chartSvg.setAttribute("width", W);
    chartSvg.setAttribute("height", H);
    chartSvg.innerHTML = `
      <defs>
        <clipPath id="cc"><rect x="${PAD.l}" y="${PAD.t}" width="${cW}" height="${cH}"/></clipPath>
        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${lc}" stop-opacity="0.25"/>
          <stop offset="100%" stop-color="${lc}" stop-opacity="0.02"/>
        </linearGradient>
      </defs>
      ${yTicks.map((tk) => `<line x1="${PAD.l}" y1="${tk.y.toFixed(1)}" x2="${PAD.l + cW}" y2="${tk.y.toFixed(1)}" stroke="${C_GRID}" stroke-width="1"/>`).join("")}
      ${xTicks.map((tk) => `<line x1="${tk.x.toFixed(1)}" y1="${PAD.t}" x2="${tk.x.toFixed(1)}" y2="${PAD.t + cH}" stroke="${C_GRID}" stroke-width="1"/>`).join("")}
      <line x1="${PAD.l}" y1="${pcY.toFixed(1)}" x2="${PAD.l + cW}" y2="${pcY.toFixed(1)}" stroke="${C_AXIS}" stroke-opacity="0.5" stroke-dasharray="4,3" stroke-width="1"/>
      <path d="${fp}" fill="url(#areaGrad)" clip-path="url(#cc)"/>
      <path d="${lp}" fill="none" stroke="${lc}" stroke-width="1.3" clip-path="url(#cc)"/>
      <circle cx="${xOf(lastValidIdx).toFixed(1)}" cy="${yOf(lastPrice).toFixed(1)}" r="3" fill="${lc}"/>
      ${yTicks.map((tk) => `<text x="${PAD.l - 5}" y="${(tk.y + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="${C_AXIS}">${tk.price}</text>`).join("")}
      ${yTicks.map((tk) => `<text x="${PAD.l + cW + 5}" y="${(tk.y + 4).toFixed(1)}" text-anchor="start" font-size="11" fill="${tk.color}">${tk.pct}</text>`).join("")}
      ${xTicks.map((tk) => `<text x="${tk.x.toFixed(1)}" y="${(PAD.t + cH + 17).toFixed(1)}" text-anchor="middle" font-size="11" fill="${C_AXIS}">${tk.label}</text>`).join("")}
      <rect x="${PAD.l}" y="${PAD.t}" width="${cW}" height="${cH}" fill="none" stroke="${C_BDR}" stroke-width="1"/>
      <rect id="hit" x="${PAD.l}" y="${PAD.t}" width="${cW}" height="${cH}" fill="transparent" style="cursor:crosshair"/>
    `;

    _renderVolume(PAD, cW, n, xOf, minuteData);
    chEls = null;
    _setupCrosshair(PAD, cW, cH, n, xOf, yOf, preClose, dec, lc, minuteData);
  }

  /* ---- 私有：成交量柱状图 ---- */
  function _renderVolume(PAD, cW, n, xOf, minuteData) {
    const W = volWrap.clientWidth || 600,
      H = volWrap.clientHeight;
    if (W < 10 || H < 10) return;
    const vols = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      if (minuteData[i].volume == null) continue;
      const prev =
        i > 0 && minuteData[i - 1].volume != null
          ? minuteData[i - 1].volume
          : 0;
      vols[i] = Math.max(0, minuteData[i].volume - prev);
    }
    const maxVol = Math.max(...vols, 1);
    const vt = 4,
      vb = 16,
      vH = H - vt - vb;
    const barW = Math.max(1, (cW / n) * 0.75);
    let bars = "";
    for (let i = 0; i < n; i++) {
      if (minuteData[i].volume == null) continue;
      const bH = Math.max(1, (vols[i] / maxVol) * vH);
      const prevPrice =
        i > 0 && minuteData[i - 1].price != null
          ? minuteData[i - 1].price
          : minuteData[i].price;
      const c =
        minuteData[i].price != null && minuteData[i].price >= prevPrice
          ? C_UP
          : C_DN;
      bars += `<rect x="${(xOf(i) - barW / 2).toFixed(1)}" y="${(vt + vH - bH).toFixed(1)}" width="${barW.toFixed(1)}" height="${bH.toFixed(1)}" fill="${c}" fill-opacity="0.65"/>`;
    }
    volSvg.setAttribute("width", W);
    volSvg.setAttribute("height", H);
    volSvg.innerHTML = `
      <defs><clipPath id="vcc"><rect x="${PAD.l}" y="${vt}" width="${cW}" height="${vH}"/></clipPath></defs>
      <g clip-path="url(#vcc)">${bars}</g>
      <text x="${PAD.l - 5}" y="${vt + 9}" text-anchor="end" font-size="10" fill="${C_AXIS}">${fmtVol(maxVol)}</text>
      <rect x="${PAD.l}" y="${vt}" width="${cW}" height="${vH}" fill="none" stroke="${C_BDR}" stroke-width="1"/>
      <rect id="vol-hit" x="${PAD.l}" y="${vt}" width="${cW}" height="${vH}" fill="transparent" style="cursor:crosshair"/>
    `;
  }

  /* ---- 私有：鼠标十字线 ---- */
  function _setupCrosshair(
    PAD,
    cW,
    cH,
    n,
    xOf,
    yOf,
    preClose,
    dec,
    lc,
    minuteData,
  ) {
    const hit = document.getElementById("hit");
    if (!hit) return;
    const els = _ensureChEls();
    hit.addEventListener("mousemove", onMove);
    hit.addEventListener("mouseleave", onLeave);

    function onMove(e) {
      const sr = chartSvg.getBoundingClientRect();
      const ci = Math.max(
        0,
        Math.min(
          n - 1,
          Math.round(((e.clientX - sr.left - PAD.l) / cW) * (n - 1)),
        ),
      );
      const d = minuteData[ci];
      if (!d) return;
      const pxS = xOf(ci).toFixed(1);
      els.vLine.setAttribute("x1", pxS);
      els.vLine.setAttribute("y1", PAD.t);
      els.vLine.setAttribute("x2", pxS);
      els.vLine.setAttribute("y2", PAD.t + cH);
      els.vLine.style.display = "";
      els.vvLine.setAttribute("x1", pxS);
      els.vvLine.setAttribute("y1", 0);
      els.vvLine.setAttribute("x2", pxS);
      els.vvLine.setAttribute("y2", volSvg.getAttribute("height") || "72");
      els.vvLine.style.display = "";
      if (d.price != null) {
        const pyS = yOf(d.price).toFixed(1);
        els.hLine.setAttribute("x1", PAD.l);
        els.hLine.setAttribute("y1", pyS);
        els.hLine.setAttribute("x2", PAD.l + cW);
        els.hLine.setAttribute("y2", pyS);
        els.hLine.style.display = "";
        els.dot.setAttribute("cx", pxS);
        els.dot.setAttribute("cy", pyS);
        els.dot.setAttribute("fill", "var(--vscode-editor-background)");
        els.dot.setAttribute("stroke", lc);
        els.dot.setAttribute("stroke-width", "2");
        els.dot.style.display = "";
        const pct = ((d.price - preClose) / preClose) * 100;
        const chg = d.price - preClose,
          sign = pct >= 0 ? "+" : "";
        const cls = pct > 0 ? "up" : pct < 0 ? "dn" : "gray";
        const prevVol =
          ci > 0 && minuteData[ci - 1].volume != null
            ? minuteData[ci - 1].volume
            : 0;
        const vol =
          ci === 0 ? d.volume : Math.max(0, (d.volume ?? 0) - prevVol);
        tooltipEl.innerHTML = `
          <div class="gray">${d.time.slice(-5)}</div>
          <div>价格：<span class="${cls}">${d.price.toFixed(dec)}</span></div>
          <div>涨跌：<span class="${cls}">${sign}${chg.toFixed(dec)} (${sign}${pct.toFixed(2)}%)</span></div>
          <div class="gray">成交量：${fmtVol(vol)}</div>
        `;
      } else {
        els.hLine.style.display = "none";
        els.dot.style.display = "none";
        tooltipEl.innerHTML = `<div class="gray">${d.time.slice(-5)}</div><div class="gray">暂无数据</div>`;
      }
      const wr = chartWrap.getBoundingClientRect();
      let tx = e.clientX - wr.left + 14,
        ty = e.clientY - wr.top - 8;
      if (tx + 175 > wr.width) tx = e.clientX - wr.left - 185;
      if (ty + 110 > wr.height) ty = wr.height - 118;
      tooltipEl.style.left = tx + "px";
      tooltipEl.style.top = ty + "px";
      tooltipEl.style.display = "block";
    }
    function onLeave() {
      hide();
      tooltipEl.style.display = "none";
    }
  }

  return { render, hide };
})();
