class BarChartCard extends HTMLElement {
  setConfig(config) {
    if (!config.entities || !Array.isArray(config.entities)) {
      throw new Error('Please define entities as a list');
    }
    this.config = config;
    this._min = config.min ?? 0;
    this._max = config.max ?? 100;
    this._unit = config.unit ?? '';
    this._sort = config.sort ?? null; // 'asc' (coolest first) | 'desc' (warmest first)
    this._outdoorEntity = config.outdoor_entity ?? null;
    this._trendEnabled = !!config.trend;
    this._trendThreshold = config.trend_threshold ?? 0.1;
    this._decimals = config.decimals ?? null;
    this._defaultMinTemp = config.default_min_temp ?? null;
    this._severity = config.severity ?? null;
    this._direction = config.direction === 'vertical' ? 'vertical' : 'horizontal';
    this._height = config.height ?? '150px';
    this._trendCache = this._trendCache || {};
  }

  _round(val) {
    return this._decimals !== null ? Number(val.toFixed(this._decimals)) : val;
  }

  _resolveSeverityColor(val, severityList) {
    if (!Array.isArray(severityList)) return null;
    for (const rule of severityList) {
      if (val >= rule.from && val <= rule.to) return rule.color;
    }
    return null;
  }

  _resolveColor(ent, val, valid) {
    if (ent.color) return ent.color;
    if (valid) {
      if (ent.severity) {
        return this._resolveSeverityColor(val, ent.severity) ?? 'var(--primary-color)';
      }
      if (this._severity) {
        const color = this._resolveSeverityColor(val, this._severity);
        if (color) return color;
      }
    }
    return 'var(--primary-color)';
  }

  _resolveTempValue(entityId) {
    const st = this._hass.states[entityId];
    if (!st) return null;
    const raw = entityId.startsWith('climate.')
      ? (st.attributes.temperature ?? st.attributes.target_temp_low)
      : st.state;
    const v = parseFloat(raw);
    return isNaN(v) ? null : v;
  }

  _resolveMinTemp(ent) {
    let minTemp = null;
    if (typeof ent.min_temp === 'number') {
      minTemp = ent.min_temp;
    } else if (ent.min_temp_entity) {
      minTemp = this._resolveTempValue(ent.min_temp_entity);
    } else if (this._defaultMinTemp !== null) {
      minTemp = this._defaultMinTemp;
    }
    return minTemp !== null ? this._round(minTemp) : null;
  }

  _resolveTarget(ent) {
    let target = null;
    if (typeof ent.target === 'number') {
      target = ent.target;
    } else if (ent.target_entity) {
      target = this._resolveTempValue(ent.target_entity);
    }
    return target !== null ? this._round(target) : null;
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    this._render();
    if (first) this._initTrend();
  }

  connectedCallback() {
    this._initTrend();
  }

  disconnectedCallback() {
    if (this._trendInterval) {
      clearInterval(this._trendInterval);
      this._trendInterval = null;
    }
  }

  _initTrend() {
    if (!this._hass || !this._trendEnabled || this._trendInterval) return;
    this._updateTrends();
    this._trendInterval = setInterval(() => this._updateTrends(), 60000);
  }

  async _fetchTrendStart(entityId) {
    try {
      const start = new Date(Date.now() - 15 * 60 * 1000);
      const path = `history/period/${start.toISOString()}?filter_entity_id=${entityId}&minimal_response`;
      const result = await this._hass.callApi('GET', path);
      const history = result && result[0];
      if (!history || history.length === 0) return null;
      const val = parseFloat(history[0].state);
      return isNaN(val) ? null : val;
    } catch (e) {
      return null;
    }
  }

  async _updateTrends() {
    if (!this._hass || !this._trendEnabled || this._trendFetching) return;
    this._trendFetching = true;
    try {
      const now = Date.now();
      for (const ent of this.config.entities) {
        const cached = this._trendCache[ent.entity];
        if (cached && now - cached.fetched < 55000) continue;
        const startVal = await this._fetchTrendStart(ent.entity);
        this._trendCache[ent.entity] = { startVal, fetched: Date.now() };
      }
    } finally {
      this._trendFetching = false;
    }
    this._render();
  }

  _render() {
    if (!this._hass || !this.config) return;

    const outdoorState = this._outdoorEntity ? this._hass.states[this._outdoorEntity] : null;
    let outdoorVal = outdoorState ? parseFloat(outdoorState.state) : null;
    const hasOutdoor = outdoorVal !== null && !isNaN(outdoorVal);
    if (hasOutdoor) outdoorVal = this._round(outdoorVal);

    let rowsData = this.config.entities.map((ent) => {
      const st = this._hass.states[ent.entity];
      let val = st ? parseFloat(st.state) : null;
      const valid = val !== null && !isNaN(val);
      if (valid) val = this._round(val);
      const pct = valid
        ? Math.max(0, Math.min(100, ((val - this._min) / (this._max - this._min)) * 100))
        : 0;
      const color = this._resolveColor(ent, val, valid);
      const name = ent.name || (st ? st.attributes.friendly_name : ent.entity);
      const display = valid
        ? `${this._decimals !== null ? val.toFixed(this._decimals) : val}${this._unit}`
        : '—';
      const minTemp = !ent.outdoor ? this._resolveMinTemp(ent) : null;
      const showOpenWindow =
        hasOutdoor && valid && outdoorVal < val && !ent.outdoor && (minTemp === null || val >= minTemp);

      const targetVal = this._resolveTarget(ent);
      const targetPct =
        targetVal !== null
          ? Math.max(0, Math.min(100, ((targetVal - this._min) / (this._max - this._min)) * 100))
          : null;
      const targetDisplay = targetVal !== null
        ? `${this._decimals !== null ? targetVal.toFixed(this._decimals) : targetVal}${this._unit}`
        : null;
      const targetColor = ent.target_color || 'var(--primary-text-color)';

      let trend = null;
      if (this._trendEnabled && valid) {
        const cached = this._trendCache[ent.entity];
        if (cached && cached.startVal !== null) {
          const startVal = this._round(cached.startVal);
          const diff = val - startVal;
          if (diff > this._trendThreshold) trend = 'up';
          else if (diff < -this._trendThreshold) trend = 'down';
          else trend = 'flat';
        }
      }

      return { val, valid, pct, color, name, display, showOpenWindow, trend, targetPct, targetDisplay, targetColor };
    });

    if (this._sort === 'asc' || this._sort === 'desc') {
      const dir = this._sort === 'asc' ? 1 : -1;
      rowsData = rowsData.slice().sort((a, b) => {
        if (a.valid && b.valid) return (a.val - b.val) * dir;
        if (a.valid) return -1;
        if (b.valid) return 1;
        return 0;
      });
    }

    const trendIcon = { up: 'mdi:trending-up', down: 'mdi:trending-down', flat: 'mdi:trending-neutral' };
    const iconsHtml = (row) => `
      ${row.showOpenWindow ? '<ha-icon class="icon-sm open-window" icon="mdi:window-open-variant" title="Buiten kouder dan binnen"></ha-icon>' : ''}
      ${row.trend ? `<ha-icon class="icon-sm trend-${row.trend}" icon="${trendIcon[row.trend]}" title="Trend afgelopen kwartier"></ha-icon>` : ''}`;

    const content =
      this._direction === 'vertical'
        ? `<div class="columns">${rowsData
            .map((row) => `
              <div class="col">
                <span class="value">${row.display}${iconsHtml(row)}</span>
                <div class="bar-bg-v" style="height:${this._height}">
                  <div class="bar-v" style="height:${row.pct}%;background:${row.color}"></div>
                  ${row.targetPct !== null ? `<div class="target-marker-v" style="bottom:${row.targetPct}%;background:${row.targetColor}" title="Streefwaarde: ${row.targetDisplay}"></div><span class="target-label-v" style="bottom:${row.targetPct}%">${row.targetDisplay}</span>` : ''}
                </div>
                <span class="name">${row.name}</span>
              </div>`)
            .join('')}</div>`
        : rowsData
            .map((row) => `
              <div class="row">
                <div class="label">
                  <span class="name">
                    ${row.showOpenWindow ? '<ha-icon class="icon-sm open-window" icon="mdi:window-open-variant" title="Buiten kouder dan binnen"></ha-icon>' : ''}${row.name}
                  </span>
                  <span class="value">
                    ${row.display}
                    ${row.trend ? `<ha-icon class="icon-sm trend-${row.trend}" icon="${trendIcon[row.trend]}" title="Trend afgelopen kwartier"></ha-icon>` : ''}
                  </span>
                </div>
                <div class="bar-bg"${row.targetPct !== null ? ' style="margin-top:14px"' : ''}>
                  <div class="bar" style="width:${row.pct}%;background:${row.color}"></div>
                  ${row.targetPct !== null ? `<div class="target-marker" style="left:${row.targetPct}%;background:${row.targetColor}" title="Streefwaarde: ${row.targetDisplay}"></div><span class="target-label" style="left:${row.targetPct}%">${row.targetDisplay}</span>` : ''}
                </div>
              </div>`)
            .join('');

    if (!this.content) {
      this.innerHTML = `
        <ha-card>
          ${this.config.title ? `<h1 class="card-header">${this.config.title}</h1>` : ''}
          <div class="card-content"></div>
          <style>
            .row { margin: 10px 16px; }
            .label { display:flex; justify-content:space-between; font-size:14px; margin-bottom:4px; color: var(--primary-text-color); }
            .name, .value { display:flex; align-items:center; gap:4px; }
            .value { font-weight: 500; }
            .icon-sm { --mdc-icon-size: 16px; }
            .open-window { color: var(--info-color, #039be5); }
            .trend-up { color: var(--error-color, #e53935); }
            .trend-down { color: var(--info-color, #039be5); }
            .trend-flat { color: var(--secondary-text-color); }
            .bar-bg { position:relative; background: var(--divider-color, #e0e0e0); border-radius: 6px; height: 12px; overflow: hidden; }
            .bar { height: 100%; border-radius: 6px; transition: width 0.3s ease; }
            .target-marker { position:absolute; top:0; bottom:0; width:2px; transform:translateX(-50%); }
            .target-marker-v { position:absolute; left:0; right:0; height:2px; transform:translateY(50%); }
            .target-label { position:absolute; bottom:100%; margin-bottom:2px; transform:translateX(-50%); font-size:10px; line-height:1; color: var(--secondary-text-color); white-space:nowrap; }
            .target-label-v { position:absolute; left:100%; margin-left:4px; transform:translateY(50%); font-size:10px; line-height:1; color: var(--secondary-text-color); white-space:nowrap; }
            .columns { display:flex; justify-content:space-around; align-items:flex-end; margin: 10px 16px; gap: 8px; }
            .col { display:flex; flex-direction:column; align-items:center; flex:1; min-width:0; }
            .col .value { display:inline-flex; align-items:center; gap:4px; font-size:14px; font-weight:500; color: var(--primary-text-color); margin-bottom:6px; white-space:nowrap; }
            .bar-bg-v { position:relative; width:24px; background: var(--divider-color, #e0e0e0); border-radius:6px; overflow:visible; }
            .bar-v { position:absolute; bottom:0; left:0; width:100%; border-radius:6px; transition:height 0.3s ease; }
            .col .name { font-size:12px; color: var(--secondary-text-color); margin-top:6px; text-align:center; }
          </style>
        </ha-card>`;
      this.content = this.querySelector('.card-content');
    }
    this.content.innerHTML = content;
  }

  getCardSize() {
    if (this._direction === 'vertical') {
      return 1 + Math.ceil((parseInt(this._height, 10) || 150) / 50);
    }
    return 1 + (this.config?.entities?.length || 0);
  }

  static getStubConfig() {
    return {
      title: 'Bar Chart',
      min: 0,
      max: 100,
      unit: '',
      entities: [{ entity: 'sensor.example', name: 'Example', color: '#e53935' }],
    };
  }
}

customElements.define('bar-chart-card', BarChartCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'bar-chart-card',
  name: 'Bar Chart Card',
  description: 'Simple horizontal or vertical bar comparison card for multiple entities in one card',
});
