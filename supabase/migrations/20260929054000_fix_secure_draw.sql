create or replace function public.draw_numbers(p_board uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare b public.boards%rowtype; h int[] := array[0,1,2,3,4,5,6,7,8,9]; a int[] := array[0,1,2,3,4,5,6,7,8,9];
 i int; j int; tmp int; n bigint; lim bigint; axis int; uid uuid := auth.uid();
begin
 if uid is null or not exists(select 1 from public.profiles where id=uid and role='admin') then raise exception 'Admin access required'; end if;
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
 insert into public.audit_events(actor_id,kind,reference_id) values(uid,'NUMBER_DRAW',p_board::text);
end $$;
