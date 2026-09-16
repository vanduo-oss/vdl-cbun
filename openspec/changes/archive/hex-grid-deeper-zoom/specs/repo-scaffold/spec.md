# repo-scaffold — spec delta (hex-grid-deeper-zoom)

## MODIFIED Requirements

### Requirement: per-component version manifest

The repo MUST ship `component-versions.json` with keys `code-editor`, `draw`,
`hex-grid`, and `music-player` only. Values MUST be `1.1.0`, `1.1.0`, `1.2.0`,
and `1.0.1` respectively. The root entry `src/index.js` SHALL export a frozen
`VDL_CBUN_VERSIONS` map whose values mirror that manifest exactly. An automated
test MUST assert the sync.

#### Scenario: version map matches the manifest

- **GIVEN** `component-versions.json` and the exported `VDL_CBUN_VERSIONS`
- **WHEN** the smoke test runs
- **THEN** the maps are deep-equal and `Object.isFrozen(VDL_CBUN_VERSIONS)` is
  true
