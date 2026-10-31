import type { Business } from './types';

export const profileOf = (b: Business) => ({
  name: b.name, industry: b.industry, stage: b.business_stage, location: b.location, years_operating: b.years_operating,
  people: b.employee_count, revenue: b.annual_revenue_range, products_services: b.products_services,
  primary_goal: b.primary_goal, biggest_challenge: b.biggest_challenge,
});
