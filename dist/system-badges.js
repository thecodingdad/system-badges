/**
 * System Badges for Home Assistant
 * =================================
 * v2.0.0
 *
 * Five custom badges:
 *   - custom:system-updates-badge       (available updates count)
 *   - custom:system-repairs-badge       (active repairs count)
 *   - custom:system-notifications-badge (persistent notifications count)
 *   - custom:system-combined-badge      (sum of updates + repairs + notifications)
 *   - custom:system-search-badge        (opens Quick Bar search)
 *   - custom:system-restart-badge       (opens restart menu dialog)
 *
 * Common config options:
 *   icon: "mdi:xxx"                     # custom icon
 *   icon_color: "var(--primary-color)"  # icon color (CSS value)
 *   color: "var(--primary-color)"       # badge background / count color
 *   hide_when_zero: false               # hide badge when count is 0
 *   tap_action:                         # action on tap (default differs per badge)
 *   hold_action:                        # action on hold
 *   double_tap_action:                  # action on double tap
 */

const SYSTEM_BADGES_VERSION = '1.0.0';

const { t } = await import(`./i18n/index.js?v=${SYSTEM_BADGES_VERSION}`);

// ── LitElement from HA's frontend bundle ───────────────────────────

const LitElement = Object.getPrototypeOf(customElements.get('ha-panel-lovelace'));
const html = LitElement.prototype.html;
const css = LitElement.prototype.css;

// ── Helpers ────────────────────────────────────────────────────────

function _handleAction(element, hass, actionConfig) {
  if (!actionConfig || actionConfig.action === 'none') return;

  switch (actionConfig.action) {
    case 'navigate':
      if (actionConfig.navigation_path) {
        history.pushState(null, '', actionConfig.navigation_path);
        window.dispatchEvent(new Event('location-changed'));
      }
      break;

    case 'url':
      if (actionConfig.url_path) {
        window.open(actionConfig.url_path, '_blank');
      }
      break;

    case 'more-info':
      if (actionConfig.entity) {
        element.dispatchEvent(new CustomEvent('hass-more-info', {
          bubbles: true, composed: true,
          detail: { entityId: actionConfig.entity },
        }));
      }
      break;

    case 'call-service': {
      const [domain, service] = (actionConfig.service || '').split('.', 2);
      if (domain && service) {
        hass.callService(domain, service, actionConfig.service_data || {}, actionConfig.target || {});
      }
      break;
    }

    case 'fire-dom-event':
      element.dispatchEvent(new CustomEvent('ll-custom', {
        bubbles: true, composed: true,
        detail: actionConfig,
      }));
      break;

    case 'notification-popup':
      try {
        const ha = document.querySelector('home-assistant');
        const main = ha?.shadowRoot?.querySelector('home-assistant-main');
        const drawer = main?.shadowRoot?.querySelector('ha-drawer');
        const sidebar = drawer?.querySelector('ha-sidebar');
        const bell = sidebar?.shadowRoot?.querySelector('.notifications');
        if (bell) { bell.click(); break; }
      } catch (_) { /* fallback */ }
      history.pushState(null, '', '/config');
      window.dispatchEvent(new Event('location-changed'));
      break;

    case 'restart-dialog':
      _openRestartDialog(hass);
      break;

    case 'quick-bar':
      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'e', code: 'KeyE', bubbles: true, composed: true,
      }));
      break;
  }
}

// ── Restart Dialog ─────────────────────────────────────────────────

const RESTART_ACTIONS = [
  { key: 'reload',    icon: 'mdi:auto-fix',     bg: 'rgb(95,138,73)',  color: '#fff' },
  { key: 'restart',   icon: 'mdi:refresh',      bg: 'rgb(255,213,0)',  color: 'rgb(102,85,0)' },
];

const RESTART_ADVANCED = [
  { key: 'reboot',    icon: 'mdi:power-cycle',  bg: 'rgb(186,27,27)',  color: '#fff' },
  { key: 'shutdown',  icon: 'mdi:power',        bg: 'rgb(11,29,41)',   color: '#fff' },
  { key: 'safe_mode', icon: 'mdi:lifebuoy',     bg: 'rgb(228,134,41)', color: '#fff' },
];

function _createRestartItem(action, hass) {
  const item = document.createElement('ha-md-list-item');
  item.type = 'button';

  const iconWrap = document.createElement('div');
  iconWrap.slot = 'start';
  Object.assign(iconWrap.style, {
    borderRadius: 'var(--ha-border-radius-circle)',
    width: '40px', height: '40px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    backgroundColor: action.bg, color: action.color,
  });
  const icon = document.createElement('ha-icon');
  icon.icon = action.icon;
  iconWrap.appendChild(icon);
  item.appendChild(iconWrap);

  const headline = document.createElement('div');
  headline.slot = 'headline';
  headline.textContent = t(hass, `restart_${action.key}`);
  item.appendChild(headline);

  const desc = document.createElement('div');
  desc.slot = 'supporting-text';
  desc.textContent = t(hass, `restart_${action.key}_desc`);
  item.appendChild(desc);

  const chevron = document.createElement('ha-icon-next');
  chevron.slot = 'end';
  item.appendChild(chevron);

  return item;
}

async function _execRestartAction(key, hass) {
  switch (key) {
    case 'reload':    return hass.callService('homeassistant', 'reload_all');
    case 'restart':   return hass.callService('homeassistant', 'restart');
    case 'reboot':    return hass.callService('hassio', 'host_reboot');
    case 'shutdown':  return hass.callService('hassio', 'host_shutdown');
    case 'safe_mode': return hass.callWS({ type: 'supervisor/api', endpoint: '/core/restart', method: 'post', data: { safe_mode: true } });
  }
}

function _openRestartDialog(hass) {
  const dialog = document.createElement('ha-adaptive-dialog');
  dialog.hass = hass;
  dialog.headerTitle = t(hass, 'Restart Menu');
  dialog.style.cssText = '--dialog-content-padding: 0;';

  const content = document.createElement('div');

  // ── Build menu view ──
  const buildMenu = () => {
    content.innerHTML = '';
    dialog.headerTitle = t(hass, 'Restart Menu');

    const mainList = document.createElement('ha-md-list');
    for (const action of RESTART_ACTIONS) {
      const item = _createRestartItem(action, hass);
      item.addEventListener('click', () => showConfirm(action.key));
      mainList.appendChild(item);
    }
    content.appendChild(mainList);

    const panel = document.createElement('ha-expansion-panel');
    panel.header = t(hass, 'Advanced Options');
    panel.style.cssText = 'border-top: 1px solid var(--divider-color); margin-bottom: 10px; box-shadow: none; --expansion-panel-content-padding: 0; --expansion-panel-summary-padding: 0 20px; --ha-card-border-radius: 0;';

    const advList = document.createElement('ha-md-list');
    for (const action of RESTART_ADVANCED) {
      const item = _createRestartItem(action, hass);
      item.addEventListener('click', () => showConfirm(action.key));
      advList.appendChild(item);
    }
    panel.appendChild(advList);
    content.appendChild(panel);
  };

  // ── Build confirm view (replaces content in-place) ──
  const showConfirm = (key) => {
    if (key === 'reload') {
      _execRestartAction(key, hass);
      closeDialog();
      return;
    }

    content.innerHTML = '';
    dialog.headerTitle = t(hass, `restart_${key}`);

    const wrap = document.createElement('div');
    wrap.style.cssText = 'padding: 0 24px 24px;';

    const title = document.createElement('h2');
    title.style.cssText = 'margin: 0 0 8px; font-size: var(--ha-font-size-xl, 22px); font-weight: var(--ha-font-weight-normal, 400); color: var(--primary-text-color);';
    title.textContent = t(hass, `restart_${key}_confirm_title`);
    wrap.appendChild(title);

    const desc = document.createElement('p');
    desc.style.cssText = 'margin: 0; color: var(--secondary-text-color); font-size: var(--ha-font-size-m, 14px); line-height: var(--ha-line-height-normal, 1.5);';
    desc.textContent = t(hass, `restart_${key}_confirm_desc`);
    wrap.appendChild(desc);

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display: flex; justify-content: flex-end; gap: 8px; margin-top: 24px;';

    const cancelBtn = document.createElement('ha-button');
    cancelBtn.setAttribute('variant', 'brand');
    cancelBtn.setAttribute('appearance', 'plain');
    cancelBtn.textContent = t(hass, 'Cancel');
    cancelBtn.addEventListener('click', () => buildMenu());
    btnRow.appendChild(cancelBtn);

    const okBtn = document.createElement('ha-button');
    okBtn.setAttribute('variant', 'danger');
    okBtn.setAttribute('appearance', 'accent');
    okBtn.textContent = t(hass, `restart_${key}_confirm_action`);
    okBtn.addEventListener('click', () => {
      _execRestartAction(key, hass);
      closeDialog();
    });
    btnRow.appendChild(okBtn);

    wrap.appendChild(btnRow);
    content.appendChild(wrap);
  };

  buildMenu();
  dialog.appendChild(content);

  const haRoot = document.querySelector('home-assistant');
  (haRoot?.shadowRoot ?? document.body).appendChild(dialog);
  dialog.open = true;

  history.pushState({ dialog: 'restart' }, '');

  let closed = false;
  const closeDialog = () => {
    if (closed) return;
    closed = true;
    dialog.open = false;
    if (history.state?.dialog === 'restart') history.back();
  };

  const onPopState = () => {
    window.removeEventListener('popstate', onPopState);
    closeDialog();
  };
  window.addEventListener('popstate', onPopState);

  const onClose = () => {
    closeDialog();
    window.removeEventListener('popstate', onPopState);
    dialog.remove();
  };
  dialog.addEventListener('closed', onClose);
  dialog.addEventListener('close', onClose);
}

function _isEditMode() {
  return window.location.search.includes('edit=1');
}

// ── Global count cache (survives view switches) ────────────────────

const _countCache = { updates: 0, repairs: 0, notifications: 0 };

function _getUpdatesCount(hass) {
  const count = Object.entries(hass.states)
    .filter(([id, s]) => id.startsWith('update.') && s.state === 'on')
    .length;
  _countCache.updates = count;
  return count;
}

async function _fetchRepairsCount(hass) {
  const result = await hass.callWS({ type: 'repairs/list_issues' });
  const count = (result.issues || []).filter(i => !i.ignored).length;
  _countCache.repairs = count;
  return count;
}

async function _fetchNotificationsCount(hass) {
  const result = await hass.callWS({ type: 'persistent_notification/get' });
  const count = (result || []).length;
  _countCache.notifications = count;
  return count;
}

// ── Base Badge Class ────────────────────────────────────────────────

class SystemBadgeBase extends LitElement {
  static get properties() {
    return {
      hass: { attribute: false },
      _config: { state: true },
      _count: { state: true },
    };
  }

  static get styles() {
    return css`
      :host {
        --badge-color: var(--secondary-text-color);
        -webkit-tap-highlight-color: transparent;
        display: inline-flex;
      }
      :host([hidden]) {
        display: none !important;
      }
      .badge {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--ha-space-2, 8px);
        cursor: pointer;
        user-select: none;
        -webkit-tap-highlight-color: transparent;
        height: var(--ha-badge-size, 36px);
        min-width: var(--ha-badge-size, 36px);
        padding: 0px 12px;
        box-sizing: border-box;
        width: auto;
        border-radius: var(--ha-badge-border-radius, calc(var(--ha-badge-size, 36px) / 2));
        background: var(--ha-card-background, var(--card-background-color, #fff));
        backdrop-filter: var(--ha-card-backdrop-filter, none);
        border-width: var(--ha-card-border-width, 1px);
        border-style: solid;
        border-color: var(--ha-card-border-color, var(--divider-color, #e0e0e0));
        box-shadow: var(--ha-card-box-shadow, none);
        transition: box-shadow 180ms ease-in-out, border-color 180ms ease-in-out;
      }
      .badge.icon-only {
        padding: 0;
      }
      .badge.icon-only ha-icon {
        margin-inline: 0;
      }
      .badge.dimmed {
        opacity: 0.4;
      }
      .badge:active {
        transform: scale(0.95);
      }
      .badge:focus-visible {
        --shadow-default: var(--ha-card-box-shadow, 0 0 0 0 transparent);
        --shadow-focus: 0 0 0 1px var(--badge-color);
        border-color: var(--badge-color);
        box-shadow: var(--shadow-default), var(--shadow-focus);
      }
      .badge ha-icon {
        --mdc-icon-size: var(--ha-badge-icon-size, 18px);
        color: var(--badge-icon-color);
        flex-shrink: 0;
        line-height: 0;
        margin-inline: -4px 0;
      }
      .count {
        font-size: var(--ha-badge-font-size, var(--ha-font-size-s, 14px));
        font-weight: 500;
        font-family: var(--ha-font-family, Roboto, sans-serif);
        color: var(--primary-text-color);
        line-height: var(--ha-line-height-condensed, 1.2);
      }
    `;
  }

  constructor() {
    super();
    this._config = null;
    this._count = 0;
    this._holdTimer = null;
    this._lastTap = 0;
  }

  static getConfigElement() {
    return document.createElement('system-badge-editor');
  }

  static getStubConfig() {
    return {};
  }

  // Subclasses override these
  _cacheKey() { return null; }
  _showCount() { return true; }
  _defaultIcon() { return 'mdi:bell'; }
  _defaultIconColor() { return 'var(--primary-color)'; }
  _defaultTapAction() { return { action: 'none' }; }
  _updateCount() {}

  setConfig(config) {
    this._config = {
      icon: config.icon || this._defaultIcon(),
      icon_color: config.icon_color || this._defaultIconColor(),
      color: config.color || null,
      hide_when_zero: config.hide_when_zero === true,
      tap_action: config.tap_action || this._defaultTapAction(),
      hold_action: config.hold_action || { action: 'none' },
      double_tap_action: config.double_tap_action || { action: 'none' },
    };
    const key = this._cacheKey();
    if (key && _countCache[key] !== undefined) {
      this._count = _countCache[key];
    }
  }

  updated(changedProps) {
    if (changedProps.has('hass') && this.hass) {
      this._updateCount();
    }
  }

  _setCount(count) {
    const key = this._cacheKey();
    if (key) _countCache[key] = count;
    this._count = count;
  }

  render() {
    if (!this._config) return html``;

    const showCount = this._showCount();
    const hidden = showCount && this._config.hide_when_zero && this._count === 0 && !_isEditMode();

    if (hidden) {
      this.toggleAttribute('hidden', true);
      return html``;
    }
    this.toggleAttribute('hidden', false);

    const editMode = _isEditMode();
    const dimmed = showCount && this._config.hide_when_zero && this._count === 0 && editMode;

    return html`
      <div
        class="badge ${showCount ? '' : 'icon-only'} ${dimmed ? 'dimmed' : ''}"
        style="--badge-icon-color: ${this._config.icon_color}"
        @click=${this._handleClick}
        @pointerdown=${this._handlePointerDown}
        @pointerup=${this._handlePointerUp}
        @pointercancel=${this._handlePointerUp}
        @contextmenu=${(e) => e.preventDefault()}
      >
        <ha-icon .icon=${this._config.icon}></ha-icon>
        ${showCount ? html`<span class="count">${this._count}</span>` : ''}
      </div>
    `;
  }

  _handleClick(e) {
    e.stopPropagation();
    const now = Date.now();
    const doubleTap = this._config.double_tap_action?.action !== 'none';

    if (doubleTap && now - this._lastTap < 300) {
      this._lastTap = 0;
      _handleAction(this, this.hass, this._config.double_tap_action);
    } else if (doubleTap) {
      this._lastTap = now;
      setTimeout(() => {
        if (this._lastTap === now) {
          _handleAction(this, this.hass, this._config.tap_action);
        }
      }, 300);
    } else {
      _handleAction(this, this.hass, this._config.tap_action);
    }
  }

  _handlePointerDown() {
    this._holdFired = false;
    this._holdTimer = setTimeout(() => {
      this._holdFired = true;
      _handleAction(this, this.hass, this._config.hold_action);
    }, 500);
  }

  _handlePointerUp() {
    clearTimeout(this._holdTimer);
  }

  firstUpdated() {
    this.addEventListener('click', (e) => {
      if (this._holdFired) {
        e.stopImmediatePropagation();
        this._holdFired = false;
      }
    }, true);
  }

  getCardSize() { return 0; }

  getGridOptions() {
    return { columns: 2, rows: 1, min_columns: 2, min_rows: 1 };
  }
}

// ── Updates Badge ───────────────────────────────────────────────────

class SystemUpdatesBadge extends SystemBadgeBase {
  _cacheKey() { return 'updates'; }
  _defaultIcon() { return 'mdi:package-up'; }
  _defaultIconColor() { return 'var(--info-color, var(--primary-color))'; }
  _defaultTapAction() { return { action: 'navigate', navigation_path: '/config/updates' }; }

  _updateCount() {
    if (!this.hass) return;
    this._setCount(_getUpdatesCount(this.hass));
  }
}

// ── Repairs Badge ───────────────────────────────────────────────────

class SystemRepairsBadge extends SystemBadgeBase {
  constructor() {
    super();
    this._fetchedAt = 0;
  }

  _cacheKey() { return 'repairs'; }
  _defaultIcon() { return 'mdi:wrench'; }
  _defaultIconColor() { return 'var(--error-color, #ef5350)'; }
  _defaultTapAction() { return { action: 'navigate', navigation_path: '/config/repairs' }; }

  _updateCount() {
    if (!this.hass) return;
    if (Date.now() - this._fetchedAt > 30000) {
      this._fetchedAt = Date.now();
      _fetchRepairsCount(this.hass)
        .then(c => this._setCount(c))
        .catch(e => console.warn('[system-repairs-badge]', e));
    }
  }
}

// ── Notifications Badge ─────────────────────────────────────────────

class SystemNotificationsBadge extends SystemBadgeBase {
  constructor() {
    super();
    this._fetchedAt = 0;
  }

  _cacheKey() { return 'notifications'; }
  _defaultIcon() { return 'mdi:bell'; }
  _defaultIconColor() { return 'var(--warning-color, #ffa726)'; }
  _defaultTapAction() { return { action: 'notification-popup' }; }

  _updateCount() {
    if (!this.hass) return;
    if (Date.now() - this._fetchedAt > 10000) {
      this._fetchedAt = Date.now();
      _fetchNotificationsCount(this.hass)
        .then(c => this._setCount(c))
        .catch(e => console.warn('[system-notifications-badge]', e));
    }
  }
}

// ── Combined Badge ──────────────────────────────────────────────────

class SystemCombinedBadge extends SystemBadgeBase {
  constructor() {
    super();
    this._repairsFetchedAt = 0;
    this._notificationsFetchedAt = 0;
    this._counts = {
      updates: _countCache.updates,
      repairs: _countCache.repairs,
      notifications: _countCache.notifications,
    };
  }

  _defaultIcon() { return 'mdi:bell-badge'; }
  _defaultIconColor() { return 'var(--primary-color)'; }
  _defaultTapAction() { return { action: 'navigate', navigation_path: '/config/repairs' }; }

  setConfig(config) {
    super.setConfig(config);
    this._config = {
      ...this._config,
      include_updates: config.include_updates !== false,
      include_repairs: config.include_repairs !== false,
      include_notifications: config.include_notifications !== false,
    };
    this._recalcTotal();
  }

  _updateCount() {
    if (!this.hass) return;

    if (this._config.include_updates) {
      this._counts.updates = _getUpdatesCount(this.hass);
    }

    if (this._config.include_repairs && Date.now() - this._repairsFetchedAt > 30000) {
      this._repairsFetchedAt = Date.now();
      _fetchRepairsCount(this.hass)
        .then(c => { this._counts.repairs = c; this._recalcTotal(); })
        .catch(e => console.warn('[system-combined-badge]', e));
    }

    if (this._config.include_notifications && Date.now() - this._notificationsFetchedAt > 10000) {
      this._notificationsFetchedAt = Date.now();
      _fetchNotificationsCount(this.hass)
        .then(c => { this._counts.notifications = c; this._recalcTotal(); })
        .catch(e => console.warn('[system-combined-badge]', e));
    }

    this._recalcTotal();
  }

  _recalcTotal() {
    let total = 0;
    if (this._config.include_updates) total += this._counts.updates;
    if (this._config.include_repairs) total += this._counts.repairs;
    if (this._config.include_notifications) total += this._counts.notifications;
    this._setCount(total);
  }
}

// ── Search Badge ────────────────────────────────────────────────────

class SystemSearchBadge extends SystemBadgeBase {
  _showCount() { return false; }
  _defaultIcon() { return 'mdi:magnify'; }
  _defaultIconColor() { return 'var(--secondary-text-color)'; }
  _defaultTapAction() { return { action: 'quick-bar' }; }
}

// ── Restart Badge ───────────────────────────────────────────────────

class SystemRestartBadge extends SystemBadgeBase {
  _showCount() { return false; }
  _defaultIcon() { return 'mdi:power'; }
  _defaultIconColor() { return 'var(--secondary-text-color)'; }
  _defaultTapAction() { return { action: 'restart-dialog' }; }
}

// ── Unified Editor ──────────────────────────────────────────────────

const SCHEMA_COMMON = [
  { name: 'icon',       label: 'Icon',        selector: { icon: {} } },
  { name: 'icon_color', label: 'Icon Color',  selector: { text: {} } },
  { name: 'color',      label: 'Badge Color', selector: { text: {} } },
];

const SCHEMA_HIDE_ZERO = [
  { name: 'hide_when_zero', label: 'Hide when 0', selector: { boolean: {} } },
];

const SCHEMA_COMBINED = [
  { name: 'include_updates',       label: 'Include Updates',            selector: { boolean: {} } },
  { name: 'include_repairs',       label: 'Include Repairs',        selector: { boolean: {} } },
  { name: 'include_notifications', label: 'Include Notifications', selector: { boolean: {} } },
];

const SCHEMA_ACTIONS = [
  { name: 'tap_action',        label: 'Tap Action',        selector: { ui_action: {} } },
  { name: 'hold_action',       label: 'Hold Action',       selector: { ui_action: { default_action: 'none' } } },
  { name: 'double_tap_action', label: 'Double Tap Action', selector: { ui_action: { default_action: 'none' } } },
];

class SystemBadgeEditor extends LitElement {
  static get properties() {
    return {
      hass: { attribute: false },
      _config: { state: true },
    };
  }

  static get styles() {
    return css`
      ha-expansion-panel {
        margin-bottom: 8px;
      }
    `;
  }

  setConfig(config) {
    this._config = { ...config };
  }

  _isCombined() {
    return this._config?.type === 'custom:system-combined-badge';
  }

  _isIconOnly() {
    return this._config?.type === 'custom:system-search-badge'
        || this._config?.type === 'custom:system-restart-badge';
  }

  // ── Form data / config building ──

  _formData() {
    const d = {
      icon: this._config.icon || '',
      icon_color: this._config.icon_color || '',
      color: this._config.color || '',
      tap_action: this._config.tap_action || {},
      hold_action: this._config.hold_action || { action: 'none' },
      double_tap_action: this._config.double_tap_action || { action: 'none' },
    };
    if (!this._isIconOnly()) {
      d.hide_when_zero = this._config.hide_when_zero || false;
    }
    if (this._isCombined()) {
      d.include_updates = this._config.include_updates !== false;
      d.include_repairs = this._config.include_repairs !== false;
      d.include_notifications = this._config.include_notifications !== false;
    }
    return d;
  }

  _allSchema() {
    if (this._isIconOnly()) {
      return [...SCHEMA_COMMON, ...SCHEMA_ACTIONS];
    }
    if (this._isCombined()) {
      return [...SCHEMA_COMMON, ...SCHEMA_HIDE_ZERO, ...SCHEMA_COMBINED, ...SCHEMA_ACTIONS];
    }
    return [...SCHEMA_COMMON, ...SCHEMA_HIDE_ZERO, ...SCHEMA_ACTIONS];
  }

  _buildConfig(formData) {
    const c = { type: this._config.type };

    for (const field of this._allSchema()) {
      const val = formData[field.name];
      if (field.selector.icon || field.selector.text) {
        if (val) c[field.name] = val;
      } else if (field.selector.boolean) {
        if (field.name.startsWith('include_')) {
          if (!val) c[field.name] = false;
        } else {
          if (val) c[field.name] = true;
        }
      } else if (field.selector.ui_action) {
        if (val?.action && (field.name === 'tap_action' || val.action !== 'none')) {
          c[field.name] = val;
        }
      }
    }

    return c;
  }

  _valueChanged(e) {
    e.stopPropagation();
    this._config = this._buildConfig(e.detail.value);
    this.dispatchEvent(new CustomEvent('config-changed', {
      detail: { config: { ...this._config } },
      bubbles: true, composed: true,
    }));
  }

  _renderForm(schema) {
    return html`
      <ha-form
        .hass=${this.hass}
        .data=${this._formData()}
        .schema=${schema}
        .computeLabel=${(s) => t(this.hass, s.label)}
        @value-changed=${this._valueChanged}
      ></ha-form>
    `;
  }

  render() {
    if (!this._config) return html``;

    const behaviorSchema = this._isCombined()
      ? [...SCHEMA_HIDE_ZERO, ...SCHEMA_COMBINED]
      : SCHEMA_HIDE_ZERO;

    return html`
      <ha-expansion-panel .header=${t(this.hass, 'Appearance')} leftChevron outlined expanded>
        <ha-icon slot="leading-icon" icon="mdi:palette-outline"></ha-icon>
        ${this._renderForm(SCHEMA_COMMON)}
      </ha-expansion-panel>
      ${!this._isIconOnly() ? html`
        <ha-expansion-panel .header=${t(this.hass, 'Behavior')} leftChevron outlined expanded>
          <ha-icon slot="leading-icon" icon="mdi:cog-outline"></ha-icon>
          ${this._renderForm(behaviorSchema)}
        </ha-expansion-panel>
      ` : ''}
      <ha-expansion-panel .header=${t(this.hass, 'Actions')} leftChevron outlined>
        <ha-icon slot="leading-icon" icon="mdi:gesture-tap"></ha-icon>
        ${this._renderForm(SCHEMA_ACTIONS)}
      </ha-expansion-panel>
    `;
  }
}

// ── Registration ────────────────────────────────────────────────────

customElements.define('system-badge-editor', SystemBadgeEditor);
customElements.define('system-updates-badge', SystemUpdatesBadge);
customElements.define('system-repairs-badge', SystemRepairsBadge);
customElements.define('system-notifications-badge', SystemNotificationsBadge);
customElements.define('system-combined-badge', SystemCombinedBadge);
customElements.define('system-search-badge', SystemSearchBadge);
customElements.define('system-restart-badge', SystemRestartBadge);

window.customBadges = window.customBadges || [];
const _systemBadges = [
  { type: 'system-updates-badge',       name: 'System Updates Badge',       description: 'Shows the number of available updates.' },
  { type: 'system-repairs-badge',       name: 'System Repairs Badge',       description: 'Shows the number of active repairs.' },
  { type: 'system-notifications-badge', name: 'System Notifications Badge', description: 'Shows the number of persistent notifications.' },
  { type: 'system-combined-badge',      name: 'System Combined Badge',      description: 'Shows the total of updates, repairs, and notifications.' },
  { type: 'system-search-badge',        name: 'System Search Badge',        description: 'Opens the Home Assistant search (Quick Bar).' },
  { type: 'system-restart-badge',       name: 'System Restart Badge',       description: 'Opens the Home Assistant restart menu.' },
];
for (const badge of _systemBadges) {
  if (!window.customBadges.find(b => b.type === badge.type)) {
    window.customBadges.push({ ...badge, preview: true });
  }
}

console.info(
  `%c SYSTEM-BADGES %c v${SYSTEM_BADGES_VERSION} `,
  'background:#2196F3;color:#fff;font-weight:bold;',
  'background:#ddd;color:#333;',
);
