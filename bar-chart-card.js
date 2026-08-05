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
    this._trendCache = this._trendCache || {};
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
    const outdoorVal = outdoorState ? parseFloat(outdoorState.state) : null;
    const hasOutdoor = outdoorVal !== null && !isNaN(outdoorVal);

    let rowsData = this.config.entities.map((ent) => {
      const st = this._hass.states[ent.entity];
      const val = st ? parseFloat(st.state) : null;
      const valid = val !== null && !isNaN(val);
      const pct = valid
        ? Math.max(0, Math.min(100, ((val - this._min) / (this._max - this._min)) * 100))
        : 0;
      const color = ent.color || 'var(--primary-color)';
      const name = ent.name || (st ? st.attributes.friendly_name : ent.entity);
      const display = valid ? `${val}${this._unit}` : '—';
      const showOpenWindow = hasOutdoor && valid && outdoorVal < val && !ent.outdoor;

      let trend = null;
      if (this._trendEnabled && valid) {
        const cached = this._trendCache[ent.entity];
        if (cached && cached.startVal !== null) {
          const diff = val - cached.startVal;
          if (diff > this._trendThreshold) trend = 'up';
          else if (diff < -this._trendThreshold) trend = 'down';
          else trend = 'flat';
        }
      }

      return { val, valid, pct, color, name, display, showOpenWindow, trend };
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

    const rows = rowsData
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
          <div class="bar-bg">
            <div class="bar" style="width:${row.pct}%;background:${row.color}"></div>
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
            .bar-bg { background: var(--divider-color, #e0e0e0); border-radius: 6px; height: 12px; overflow: hidden; }
            .bar { height: 100%; border-radius: 6px; transition: width 0.3s ease; }
          </style>
        </ha-card>`;
      this.content = this.querySelector('.card-content');
    }
    this.content.innerHTML = rows;
  }

  getCardSize() {
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
  description: 'Simple horizontal bar comparison card for multiple entities in one card',
});
