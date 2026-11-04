-- B3. A cost rate is a whole number of cents per hour, bounded like the charge rate. Table grants from 0040 cover the new column.
ALTER TABLE "rate_card" ADD CONSTRAINT "rate_card_cost_check" CHECK ("cost_cents_per_hour" IS NULL OR "cost_cents_per_hour" BETWEEN 0 AND 1000000);
