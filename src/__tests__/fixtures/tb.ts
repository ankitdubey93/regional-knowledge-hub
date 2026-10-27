// Synthetic trial balances for tests. Not real client data.
export const AU_TB_CSV = [
  'Trial Balance', 'Demo Pty Ltd', 'As at 30 June 2026', '',
  'Account,Account Code,Account Type,Debit - Year to date,Credit - Year to date',
  'Business Bank Account,090,Bank,"12,500.00",',
  'Accounts Receivable,610,Current Asset,"4,400.00",',
  'Office Equipment,710,Fixed Asset,"6,000.00",',
  'Accumulated Depreciation,711,Fixed Asset,,"1,200.00"',
  'Accounts Payable,800,Current Liability,,"2,200.00"',
  'GST,820,Current Liability,,"1,100.00"',
  'Owner Funds Introduced,960,Equity,,"6,800.00"',
  'Sales,200,Revenue,,"30,000.00"',
  'Purchases,300,Direct Costs,"9,000.00",',
  'Rent,469,Overhead,"8,000.00",',
  'Depreciation,416,Depreciation,"1,200.00",',
  'Bank Fees,404,Overhead,200.00,',
  'Total,,,"41,300.00","41,300.00"',
].join('\n');
export const UK_TB_CSV = [
  'Code,Name,Type,Debit,Credit',
  '1200,Bank Current Account,Bank,8000.00,',
  '1100,Trade Debtors,Current Asset,2400.00,',
  '2100,Trade Creditors,Current Liability,,1200.00',
  '2200,VAT Liability,Current Liability,,400.00',
  '3000,Share Capital,Equity,,100.00',
  '4000,Sales,Revenue,,15000.00',
  '5000,Cost of Sales,Direct Costs,4000.00,',
  '7100,Rent and Rates,Overhead,2300.00,',
].join('\n');
export const UK_TB_UNBALANCED_CSV = UK_TB_CSV.replace('7100,Rent and Rates,Overhead,2300.00,', '7100,Rent and Rates,Overhead,2000.00,');
