class BarChartCard extends HTMLElement {
  setConfig(config) {
    if (!config.entities || !Array.isArray(config.entities)) {
      throw new Error('Please define entities as a list');
    }
    this.config = config;
    this._min = config.min ?? 0;
    this._max = config.max ?? 100;
    this._unit = config.unit ?? '';
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  _render() {
    if (!this._hass || !this.config) return;
    const rows = this.config.entities
      .map((ent) => {
        const st = this._hass.states[ent.entity];
        const val = st ? parseFloat(st.state) : null;
        const pct =
          val === null || isNaN(val)
            ? 0
            : Math.max(0, Math.min(100, ((val - this._min) / (this._max - this._min)) * 100));
        const color = ent.color || 'var(--primary-color)';
        const name = ent.name || (st ? st.attributes.friendly_name : ent.entity);
        const display = val === null || isNaN(val) ? '—' : `${val}${this._unit}`;
        return `
        <div class="row">
          <div class="label">
            <span class="name">${name}</span>
            <span class="value">${display}</span>
          </div>
          <div class="bar-bg">
            <div class="bar" style="width:${pct}%;background:${color}"></div>
          </div>
        </div>`;
      })
      .join('');

    if (!this.content) {
      this.innerHTML = `
        <ha-card>
          ${this.config.title ? `<h1 class="card-header">${this.config.title}</h1>` : ''}
          <div class="card-content"></div>
          <style>
            .row { margin: 10px 16px; }
            .label { display:flex; justify-content:space-between; font-size:14px; margin-bottom:4px; color: var(--primary-text-color); }
            .value { font-weight: 500; }
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
