create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create function private.draw_numbers(p_board uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare b public.boards%rowtype; h int[] := array[0,1,2,3,4,5,6,7,8,9]; a int[] := array[0,1,2,3,4,5,6,7,8,9];
 i int; j int; tmp int; n bigint; lim bigint; axis int;
begin
 select * into b from public.boards where id=p_board for update;
 if b.status <> 'SOLD_OUT' or b.sold_count <> 100 or b.drawn_at is not null then raise exception 'Board not ready'; end if;
 for axis in 1..2 loop
  for i in reverse 10..2 loop
   lim := 4294967296 - (4294967296 % i);
   loop
    n := ('x' || encode(extensions.gen_random_bytes(4),'hex'))::bit(32)::bigint;
    exit when n < lim;
   end loop;
   j := (n % i)::int + 1;
   if axis=1 then tmp:=h[i];h[i]:=h[j];h[j]:=tmp;
   else tmp:=a[i];a[i]:=a[j];a[j]:=tmp; end if;
  end loop;
 end loop;
 update public.boards set home_digits=h,away_digits=a,drawn_at=now(),status='LOCKED' where id=p_board;
 insert into public.audit_events(actor_id,kind,reference_id) values(auth.uid(),'NUMBER_DRAW',p_board::text);
end $$;
revoke all on function private.draw_numbers(uuid) from public, anon, authenticated;

create or replace function public.purchase_square(p_board uuid,p_row int,p_col int,p_key text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare b public.boards%rowtype; g public.games%rowtype; result uuid; uid uuid := auth.uid();
begin
 if uid is null or not exists(select 1 from public.profiles where id=uid and role='player') then raise exception 'Player access required'; end if;
 if p_key is null or length(p_key) < 12 or p_row not between 0 and 9 or p_col not between 0 and 9 then raise exception 'Invalid purchase'; end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
 select * into b from public.boards where id=p_board for update;
 select * into g from public.games where id=b.game_id;
 if b.status <> 'OPEN' or b.sold_count >= 100 or not (g.status='scheduled' and (g.kickoff_at is null or g.kickoff_at > now()) or g.status='live' and g.period=1) then raise exception 'Sales closed'; end if;
 if exists(select 1 from public.ledger where idempotency_key=p_key) then raise exception 'Duplicate request'; end if;
 if public.balance_cents(uid) < b.price_cents then raise exception 'Insufficient funds'; end if;
 insert into public.squares(board_id,row_index,col_index,owner_id) values(p_board,p_row,p_col,uid) returning id into result;
 insert into public.ledger(user_id,kind,amount_cents,reference_type,reference_id,idempotency_key,actor_id)
 values(uid,'PURCHASE',-b.price_cents,'square',result::text,p_key,uid);
 update public.boards set sold_count=sold_count+1,status=case when sold_count=99 then 'SOLD_OUT' else status end where id=p_board;
 if b.sold_count=99 then perform private.draw_numbers(p_board); end if;
 return result;
end $$;
