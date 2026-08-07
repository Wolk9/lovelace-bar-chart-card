# Bar Chart Card

[![HACS Custom](https://img.shields.io/badge/HACS-Custom-41BDF5.svg)](https://github.com/hacs/integration)
[![GitHub Release](https://img.shields.io/github/v/release/Wolk9/lovelace-bar-chart-card)](https://github.com/Wolk9/lovelace-bar-chart-card/releases)
[![License](https://img.shields.io/github/license/Wolk9/lovelace-bar-chart-card)](LICENSE)

A minimal Home Assistant Lovelace card that shows one or more entities as
labelled bars (horizontal or vertical) in a single card — handy for comparing
values across rooms/devices (e.g. temperature per room) at a glance.

![Bar Chart Card screenshot](docs/screenshot.png)

## Installation

### HACS (recommended)

1. In HACS, go to **Frontend** → menu (⋮) → **Custom repositories**.
2. Add this repository URL, category **Dashboard**.
3. Install **Bar Chart Card** and reload/hard-refresh your dashboard.

### Manual

1. Download `bar-chart-card.js` from the [latest release](../../releases/latest).
2. Copy it into `config/www/`.
3. Add it as a dashboard resource: **Settings → Dashboards → Resources → Add resource**, URL `/local/bar-chart-card.js`, type **JavaScript Module**.

## Configuration

| Name | Type | Default | Description |
|------|:----:|:-------:|-------------|
| `type` | string | **required** | `custom:bar-chart-card` |
| `title` | string | | Optional card header |
| `min` | number | `0` | Minimum value for the bar scale |
| `max` | number | `100` | Maximum value for the bar scale |
| `unit` | string | `''` | Unit suffix shown after each value |
| `sort` | string | | `asc` (coolest/lowest on top) or `desc` (warmest/highest on top). Omit to keep the configured order |
| `outdoor_entity` | string | | Entity ID of an outdoor temperature sensor. Rows whose value is higher than this sensor get an open-window icon (🪟), suggesting you could air out instead of cooling actively |
| `trend` | boolean | `false` | Show a trend arrow (↗/↘/→) comparing each entity's current value to its value 15 minutes ago |
| `trend_threshold` | number | `0.1` | Minimum change over 15 minutes before a row counts as rising/falling instead of steady |
| `decimals` | number | | Round values to this many decimal places. Applied consistently to the displayed value, `sort`, the open-window comparison, and the trend comparison. Omit to use the raw, unrounded value everywhere (previous behavior) |
| `default_min_temp` | number | | Fallback minimum temperature (see `min_temp` below) for any row that doesn't set its own `min_temp`/`min_temp_entity`. Rows with `outdoor: true` never use this |
| `direction` | string | `horizontal` | `horizontal` (default, bars grow left to right) or `vertical` (bars grow bottom to top, columns side by side) |
| `height` | string | `150px` | Bar height when `direction: vertical`. Ignored in horizontal mode |
| `severity` | list | | Card-wide colour thresholds, see below. Overridden by an entity's own `color` or `severity` |
| `entities` | list | **required** | List of entities to show, see below |

### `severity`

A list of colour rules, each with `from`, `to` and `color`. The bar takes the colour of the first rule whose range contains the current value (`from <= value <= to`). Rules are checked in list order, so put more specific/narrower ranges first if ranges overlap.

```yaml
severity:
  - from: 0
    to: 17
    color: "#1e88e5"
  - from: 17
    to: 22
    color: "#43a047"
  - from: 22
    to: 40
    color: "#e53935"
```

### `entities` options

| Name | Type | Required | Description |
|------|:----:|:--------:|-------------|
| `entity` | string | Yes | Entity ID |
| `name` | string | No | Overrides the displayed name (defaults to friendly name) |
| `color` | string | No | Bar color (hex or CSS color). Takes priority over `severity` (both the entity's own and the card-wide one) |
| `severity` | list | No | Per-entity colour thresholds, same `{from, to, color}` shape as the card-wide `severity` above. When set, it fully replaces the card-wide `severity` for this row (no merging) — handy when one room needs different thresholds than the rest |
| `outdoor` | boolean | No | Set `true` for rows that are themselves an outdoor/exterior sensor (e.g. a garden reading with no window) — suppresses the open-window icon for that row regardless of `outdoor_entity`. Default `false` |
| `min_temp` | number | No | Fixed minimum temperature to keep in this room. Below this value the open-window icon never shows, even if it's colder outside — takes priority over `min_temp_entity` and `default_min_temp` |
| `min_temp_entity` | string | No | Entity ID to read the minimum temperature from dynamically instead of a fixed number — handy when each room has its own thermostat. For a `climate.*` entity this reads its target temperature (the `temperature` attribute, not its `state` which is the HVAC mode); for any other entity it reads `state` |
| `target` | number | No | Fixed target value. Renders a thin marker line on the bar at this position (a vertical line in horizontal mode, a horizontal line in vertical mode) — handy for showing a thermostat setpoint against the measured temperature. Takes priority over `target_entity` |
| `target_entity` | string | No | Entity ID to read the target value from dynamically instead of a fixed number. Same resolution as `min_temp_entity`: for a `climate.*` entity this reads its target temperature (the `temperature` attribute); for any other entity it reads `state` |
| `target_color` | string | No | Colour of the target marker line (hex or CSS color). Defaults to `var(--primary-text-color)` |

A row's minimum temperature is resolved in this order: its own `min_temp` → its own `min_temp_entity` → the card's `default_min_temp` → no minimum. Rows with `outdoor: true` skip this entirely — they never show the open-window icon anyway.

A row's colour is resolved in this order: its own `color` → its own `severity` → the card-wide `severity` → default (`var(--primary-color)`).

A row's target marker is resolved in this order: its own `target` → its own `target_entity` → no marker.

### Example

```yaml
type: custom:bar-chart-card
title: Temperature comparison
min: 15
max: 40
unit: "°C"
sort: desc
outdoor_entity: sensor.outdoor_temperature
trend: true
decimals: 1
default_min_temp: 18
entities:
  - entity: sensor.living_room_temperature
    name: Living Room
    color: "#e53935"
    min_temp_entity: climate.living_room_thermostat
    target_entity: climate.living_room_thermostat
  - entity: sensor.office_temperature
    name: Office
    color: "#fb8c00"
    min_temp: 20
  - entity: sensor.bedroom_temperature
    name: Bedroom
    color: "#6d4c41"
  - entity: sensor.backyard_temperature
    name: Backyard
    color: "#43a047"
    outdoor: true
```

### Example — vertical with severity colours

```yaml
type: custom:bar-chart-card
title: Temperature comparison
direction: vertical
height: 150px
min: 0
max: 30
unit: "°C"
severity:
  - from: 0
    to: 17
    color: "#1e88e5"
  - from: 17
    to: 22
    color: "#43a047"
  - from: 22
    to: 30
    color: "#e53935"
entities:
  - entity: sensor.living_room_temperature
    name: Living Room
  - entity: sensor.office_temperature
    name: Office
  - entity: sensor.bedroom_temperature
    name: Bedroom
```
