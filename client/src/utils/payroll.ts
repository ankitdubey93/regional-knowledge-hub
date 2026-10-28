import { applyRate } from '@chub/shared/utils/money';

/**
 * AU super guarantee on one payday's qualifying earnings (Payday Super, from
 * 1 July 2026). The maximum contribution base is annual: earnings above it in
 * the financial year attract no compulsory super.
 */
export function superGuarantee(input: {
  qualifyingEarningsCents: number;
  earningsSoFarThisYearCents: number;
  rateBp: number;
  maxContributionBaseAnnualCents: number;
}): { liableEarningsCents: number; superCents: number; cappedCents: number } {
  const room = Math.max(0, input.maxContributionBaseAnnualCents - input.earningsSoFarThisYearCents);
  const liable = Math.min(input.qualifyingEarningsCents, room);
  return {
    liableEarningsCents: liable,
    superCents: applyRate(liable, input.rateBp),
    cappedCents: input.qualifyingEarningsCents - liable,
  };
}

/**
 * UK employer Class 1 NIC for a year, worked on annual earnings per employee
 * (real payroll works per pay period with the period threshold; the annual
 * view is the teaching simplification). The Employment Allowance then reduces
 * the employer's total bill, never below zero.
 */
export function employerNic(input: {
  annualEarningsCents: number[];
  secondaryThresholdAnnualCents: number;
  rateBp: number;
  employmentAllowanceCents: number;
  claimsAllowance: boolean;
}): { perEmployeeCents: number[]; grossCents: number; allowanceUsedCents: number; payableCents: number } {
  const perEmployee = input.annualEarningsCents.map((e) =>
    applyRate(Math.max(0, e - input.secondaryThresholdAnnualCents), input.rateBp),
  );
  const gross = perEmployee.reduce((a, b) => a + b, 0);
  const allowance = input.claimsAllowance ? Math.min(gross, input.employmentAllowanceCents) : 0;
  return { perEmployeeCents: perEmployee, grossCents: gross, allowanceUsedCents: allowance, payableCents: gross - allowance };
}

/**
 * UK CIS deduction on a subcontractor's invoice. The deduction applies to the
 * labour element only: materials the subcontractor bought, VAT and the CITB
 * levy are excluded.
 */
export function cisDeduction(input: {
  grossExVatCents: number;
  materialsCents: number;
  vatCents: number;
  rateBp: number;
}): { labourCents: number; deductionCents: number; payToSubcontractorCents: number } {
  const labour = Math.max(0, input.grossExVatCents - input.materialsCents);
  const deduction = applyRate(labour, input.rateBp);
  return {
    labourCents: labour,
    deductionCents: deduction,
    payToSubcontractorCents: input.grossExVatCents + input.vatCents - deduction,
  };
}
