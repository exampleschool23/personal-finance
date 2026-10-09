-- Retired: a one-time correction of four spending plans' start dates in a single
-- workspace, applied there in September 2026. It named that workspace's plans and
-- failed on every other database, so it is now a no-op that keeps the number.
-- Fresh databases never needed it (database/setup.sql does not include it).
SELECT 1;
