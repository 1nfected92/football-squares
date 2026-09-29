create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into public.profiles(id,display_name,role)
 values(new.id,coalesce(nullif(split_part(new.email,'@',1),''),'Player'),'player');
 insert into public.ledger(user_id,kind,amount_cents,reference_type,reference_id,idempotency_key,actor_id)
 values(new.id,'DEMO_WELCOME',50000,'demo',new.id::text,'demo-welcome:'||new.id,null);
 return new;
end $$;
insert into public.boards(game_id,price_cents,commission_bps,status)
select g.id,t.price,1000,'OPEN' from (select id from public.games where status='scheduled' and kickoff_at>now() and home_team<>'TBD' order by kickoff_at limit 3) g
cross join (values (1000),(2500),(10000)) t(price);
