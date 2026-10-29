import templatesJson from '../../seed/engagement-templates.json';
import { engagementTemplatesSchema, type EngagementTemplates } from './schemas';

// Parsed once; the web and the server both import this. Edited by code review, not in the admin.
export const ENGAGEMENT_TEMPLATES: EngagementTemplates = engagementTemplatesSchema.parse(templatesJson);
