// Shared limits and the single mutable state of the page. Every UI module reads and writes `state`.

/** Columns shown when a file opens (wider files start with the first ones). */
export const MAX_DEFAULT_COLUMNS = 200
/** Above this many row groups the slider draws one plain bar instead of segments. */
export const MAX_RG_SEGMENTS = 300
/** Row groups listed in the Metadados tab. */
export const MAX_RG_DETAILS = 1000

export const state = {
  // libraries loaded from the CDN (see main.js) and the open file (core/reader.js openParquet)
  lib: null,
  ctx: null,
  buffer: null, // lruBuffer over ctx.file, used for page reads
  sample: false, // the embedded example file is open
  capped: false, // more than MAX_DEFAULT_COLUMNS columns, only the first are visible
  // data page
  visible: [], // names of the visible top-level columns, in schema order
  page: 0,
  pageSize: 100,
  rows: [], // current page: arrays aligned with `visible`
  rowStart: 0, // position of rows[0] in the current list (file rows or query result)
  rowNums: null, // original row numbers of the page when a query is active
  token: 0, // guards against stale page reads
  active: null, // { r, c } active cell for the keyboard
  view: [], // columns as drawn: { j } file column or { j, muni: true } município column
  // downloads (ui/downloads.js)
  downloads: null,
  downloadsReady: null,
  downloadsChecked: false,
  downloadsWhy: '',
  // export dialog (ui/export-dialog.js)
  exportMode: 'options', // options | running | copy-ready | done
  cancelExport: false,
  progressTotal: 0,
  clip: null, // prepared clipboard data
  lastUrl: null,
  lastName: '',
  // cell detail
  copyText: null,
  // slider drag
  drag: null,
  // município column (ui/municipio.js)
  muni: '', // source column name, '' when off
  muniAuto: true, // detection still allowed for this file
  // search, filter, sort (ui/query-state.js)
  table: null, // whole columns in memory: { cols, keys, folded } maps by column name
  tableToken: 0,
  tableChain: null,
  query: { search: '', filters: new Map(), sort: null },
  queryToken: 0,
  result: null, // Uint32Array of row indices when a query is active
  menu: null, // open column menu
  // row marks (ui/marks.js)
  sel: null, // { marks: Uint8Array per row, count, anchor }
}
