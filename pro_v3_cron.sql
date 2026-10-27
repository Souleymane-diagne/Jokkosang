create extension if not exists pg_cron;
select cron.schedule('jokko-escalade', '* * * * *', $$select escalade_auto()$$);
