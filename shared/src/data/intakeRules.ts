import rulesJson from '../../seed/intake-rules.json';
import { intakeRulesSchema, type IntakeRules } from './schemas';

// Parsed once; the web and the server both import this. Edited by code review, not in the admin.
export const INTAKE_RULES: IntakeRules = intakeRulesSchema.parse(rulesJson);
