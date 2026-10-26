/** The interactive tools a doc can point to from its `tools:` frontmatter. */
export const TOOLS = {
  journal: { title: 'Journal simulator', to: '/tools/journal', blurb: 'Post debits and credits for real scenarios and see the T-accounts and trial balance.' },
  tax: { title: 'Tax calculator', to: '/tools/tax', blurb: 'GST, the BAS worksheet, the UK VAT return, super, employer NIC and CIS.' },
  depreciation: { title: 'Depreciation', to: '/tools/depreciation', blurb: 'Straight line vs reducing balance, year by year, with the journals.' },
  inventory: { title: 'Inventory: FIFO vs weighted average', to: '/tools/inventory', blurb: 'Run the same purchases and sales through both cost formulas.' },
  'company-size': { title: 'Company size', to: '/tools/company-size', blurb: 'UK micro, small or medium (with the two-year rule) and AU small or large proprietary.' },
  compare: { title: 'Compare frameworks', to: '/compare', blurb: 'IFRS vs FRS 102 vs FRS 105 vs AASB, topic by topic.' },
  coding: { title: 'Coding scenarios', to: '/practice/coding', blurb: 'Pick the account and the Xero tax rate for real-looking bills and bank lines.' },
  checklist: { title: 'Month-end checklist', to: '/learn/core-accounting/month-end-close-checklist#checklist', blurb: 'Tick through a full close.' },
} as const;

export type ToolId = keyof typeof TOOLS;

export function isToolId(id: string): id is ToolId {
  return id in TOOLS;
}
