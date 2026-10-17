/* ======================================================================
   STATE CONFIG — PUNJAB ONLY
   ----------------------------------------------------------------------
   This dashboard covers Punjab only, so there is a single block here.
   Theme, party list, seat counts and leaders all come from it.
   ====================================================================== */

const STATE_CONFIGS = {

  /* ------------------------------------------------------------------ */
  'Punjab': {
    key: 'Punjab',
    short: 'PB',
    tagline: "AI-assisted intelligence on Punjab's political conversation — every handle, every constituency, every shift in sentiment, tracked in one terminal.",
    seats: { ac: 117, pc: 13, districts: 23 },
    ruling: 'AAP',            // Punjab government
    rulingCentre: 'BJP',      // centre government
    opposition: ['INC', 'SAD', 'BJP', 'BSP'],
    /* Theme: deep teal + wheat gold.
       Teal is a deliberate choice - no major Punjab party uses it (SAD is
       navy, AAP blue, INC light blue, BJP saffron, BSP blue). That keeps
       the dashboard from looking partisan, and clearly apart from the
       blue UP build. */
    theme: {
      primary: '#0F766E',
      primaryRgb: '15,118,110',
      accent: '#14B8A6',
      navy: '#0B2E2A',
      heroFrom: '#0B2E2A',
      heroMid: '#0F4A42',
      heroTo: '#14655A',
      heroGlow: '20,184,166',
      gold: '#D4A017',
    },
    parties: [
      { code: 'AAP',    name: 'Aam Aadmi Party',                   color: '#0072BC' },
      { code: 'INC',    name: 'Indian National Congress',          color: '#00A0E3' },
      { code: 'SAD',    name: 'Shiromani Akali Dal',               color: '#1B3B8B' },
      { code: 'BJP',    name: 'Bharatiya Janata Party',            color: '#FF9933' },
      { code: 'BSP',    name: 'Bahujan Samaj Party',               color: '#22409A' },
      { code: 'SAD(A)', name: 'Shiromani Akali Dal (Amritsar)',    color: '#F5C518' },
      { code: 'CPI',    name: 'Communist Party of India',          color: '#B91C1C' },
      { code: 'CPM',    name: 'Communist Party of India (Marxist)',color: '#991B1B' },
      { code: 'PLC',    name: 'Punjab Lok Congress',               color: '#7C3AED' },
      { code: 'SSM',    name: 'Sanyukt Samaj Morcha',              color: '#0E7C61' },
      { code: 'IND',    name: 'Independent',                       color: '#64748B' },
    ],
    /* Punjab's top leaders + the 2022 assembly result.
       Note: the Deputy CM post has been VACANT since 16 March 2022 - Punjab
       has no Dy CM right now, so no name is invented here. */
    leaders: {
      cm:      {name:'Bhagwant Mann', party:'AAP', seat:'Dhuri', since:'16 Mar 2022', handle:'BhagwantMann'},
      dyCm:    null,
      speaker: {name:'Kultar Singh Sandhwan', party:'AAP', seat:'Kotkapura'},
      dySpeaker:{name:'Jai Krishan Singh Rouri', party:'AAP', seat:'Garhshankar'},
      governor:{name:'Gulab Chand Kataria'},
    },
    /* 2022 Vidhan Sabha result — total 117 */
    seatsWon: [
      {party:'AAP', seats:92}, {party:'INC', seats:18}, {party:'SAD', seats:3},
      {party:'BJP', seats:2},  {party:'BSP', seats:1},  {party:'IND', seats:1},
    ],
    aliases: {
      'AAM AADMI PARTY': 'AAP',
      'INDIAN NATIONAL CONGRESS': 'INC',
      'CONGRESS': 'INC',
      'SHIROMANI AKALI DAL': 'SAD',
      'AKALI DAL': 'SAD',
      'SAD (B)': 'SAD',
      'SHIROMANI AKALI DAL (BADAL)': 'SAD',
      'SHIROMANI AKALI DAL (AMRITSAR)': 'SAD(A)',
      'SAD (A)': 'SAD(A)',
      'BHARATIYA JANATA PARTY': 'BJP',
      'BAHUJAN SAMAJ PARTY': 'BSP',
      'PUNJAB LOK CONGRESS': 'PLC',
      'SANYUKT SAMAJ MORCHA': 'SSM',
      'CPI(M)': 'CPM',
      'INDEPENDENT': 'IND',
    },
  },
};

/* The dashboard is locked to Punjab - no auto-detection from the data. */
const DEFAULT_STATE = 'Punjab';
let ACTIVE_STATE = DEFAULT_STATE;

if (typeof window !== 'undefined') {
  window.STATE_CONFIGS = STATE_CONFIGS;
  window.DEFAULT_STATE = DEFAULT_STATE;
  document.documentElement.setAttribute('data-state', 'Punjab');
}
