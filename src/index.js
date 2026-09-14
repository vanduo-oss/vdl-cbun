// Root entry of @vanduo-oss/vdl-cbun.
//
// Exposes ONLY the per-component VERSION-constants map. Component APIs live on
// the subpath exports (./code-editor, ./code-editor/highlight, ./draw,
// ./hex-grid, ./hex-grid/hex-math, ./music-player) so importing one component
// never pulls in another (tree-shaking contract).
//
// The values below are hardcoded mirrors of component-versions.json (the
// manifest is the source of truth). The version-consistency check —
// tests/smoke.spec.ts — asserts the two stay in sync; bump both together.
// Widget VERSION constants remain load-bearing (draw/hex/code-editor 1.1.0,
// music-player 1.0.1) — extracted 1-to-1 from @vanduo-oss/vd3-cbun@1.4.2.

export const VDL_CBUN_VERSIONS = Object.freeze({
  'code-editor': '1.1.0',
  draw: '1.1.0',
  'hex-grid': '1.1.0',
  'music-player': '1.0.1',
});
