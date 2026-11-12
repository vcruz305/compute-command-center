// Committed scene palettes. Each theme recolors the environment (core, grid,
// links, particles, key light) and the UI accent. Device identity colors
// (gold Spark, silver Macs) stay semantic and are not themed.
export interface Theme {
  id: string
  label: string
  accent: string
  accent2: string
  grid: string
  gridCell: string
  particle: string
  swatch: string
}

export const THEMES: Theme[] = [
  { id: 'cyan',   label: 'Command', accent: '#22d3ee', accent2: '#3b82f6', grid: '#155e75', gridCell: '#0e3a4a', particle: '#67e8f9', swatch: '#22d3ee' },
  { id: 'ember',  label: 'Reactor', accent: '#fbbf24', accent2: '#f97316', grid: '#9a3412', gridCell: '#431407', particle: '#fcd34d', swatch: '#fbbf24' },
  { id: 'aurora', label: 'Biome',   accent: '#4ade80', accent2: '#22d3ee', grid: '#166534', gridCell: '#052e16', particle: '#86efac', swatch: '#4ade80' },
  { id: 'violet', label: 'Nebula',  accent: '#a78bfa', accent2: '#ec4899', grid: '#5b21b6', gridCell: '#2e1065', particle: '#c4b5fd', swatch: '#a78bfa' },
]

export const themeById = (id: string): Theme => THEMES.find(t => t.id === id) || THEMES[0]
