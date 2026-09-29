alter table public.profiles add column username text unique;
alter table public.profiles add constraint username_format check (username ~ '^[a-z][a-z0-9_]{2,29}$');

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
declare chosen text := lower(trim(new.raw_user_meta_data->>'username'));
begin
 if chosen = 'admin' then raise exception 'Username unavailable'; end if;
 insert into public.profiles(id,display_name,role,username)
 values(new.id,coalesce(nullif(chosen,''),nullif(split_part(new.email,'@',1),''),'Player'),'player',nullif(chosen,''));
 insert into public.ledger(user_id,kind,amount_cents,reference_type,reference_id,idempotency_key,actor_id)
 values(new.id,'DEMO_WELCOME',50000,'demo',new.id::text,'demo-welcome:'||new.id,null);
 return new;
end $$;
