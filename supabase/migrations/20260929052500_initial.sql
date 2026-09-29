-- Demo funds only. No real-cash operations may be enabled by this migration.
create extension if not exists pgcrypto;
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Player',
  role text not null default 'player' check (role in ('player','agent','admin')),
  created_at timestamptz not null default now()
);
create table public.games (
  id text primary key, season int not null, season_type int not null, week int not null,
  home_team text not null, away_team text not null, kickoff_at timestamptz,
  status text not null default 'scheduled' check (status in ('scheduled','live','final','postponed','cancelled')),
  period int not null default 0 check (period between 0 and 8),
  home_score int not null default 0 check (home_score >= 0),
  away_score int not null default 0 check (away_score >= 0),
  linescores jsonb not null default '{}'::jsonb,
  clock text, synced_at timestamptz,
  unique(season, season_type, week, home_team, away_team)
);
create table public.boards (
  id uuid primary key default gen_random_uuid(), game_id text not null references public.games(id),
  price_cents bigint not null check (price_cents > 0),
  commission_bps int not null check (commission_bps between 0 and 10000),
  status text not null default 'DRAFT' check (status in ('DRAFT','OPEN','SOLD_OUT','LOCKED','LIVE','FINAL','SETTLED','CANCELLED','REFUNDED')),
  sold_count int not null default 0 check (sold_count between 0 and 100),
  home_digits int[], away_digits int[], drawn_at timestamptz,
  created_at timestamptz not null default now(),
  check ((home_digits is null and away_digits is null and drawn_at is null) or
    (array_length(home_digits,1)=10 and array_length(away_digits,1)=10 and drawn_at is not null))
);
create table public.squares (
  id uuid primary key default gen_random_uuid(), board_id uuid not null references public.boards(id),
  row_index int not null check (row_index between 0 and 9), col_index int not null check (col_index between 0 and 9),
  owner_id uuid not null references public.profiles(id), purchased_at timestamptz not null default now(),
  unique(board_id,row_index,col_index)
);
create table public.ledger (
  id bigint generated always as identity primary key, user_id uuid not null references public.profiles(id),
  kind text not null, amount_cents bigint not null check (amount_cents <> 0),
  reference_type text not null, reference_id text not null,
  idempotency_key text not null unique, actor_id uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index ledger_user_idx on public.ledger(user_id,id);
create table public.deposits (
  id uuid primary key default gen_random_uuid(), player_id uuid not null references public.profiles(id),
  agent_id uuid not null references public.profiles(id), amount_cents bigint not null check(amount_cents > 0),
  status text not null default 'PENDING' check(status in ('PENDING','APPROVED','REJECTED')),
  reviewer_id uuid references public.profiles(id), created_at timestamptz not null default now(), resolved_at timestamptz
);
create table public.withdrawals (
  id uuid primary key default gen_random_uuid(), player_id uuid not null references public.profiles(id),
  amount_cents bigint not null check(amount_cents > 0), status text not null default 'PENDING' check(status in ('PENDING','PAID','REJECTED')),
  reviewer_id uuid references public.profiles(id), created_at timestamptz not null default now(), resolved_at timestamptz
);
create table public.settlements (
  id uuid primary key default gen_random_uuid(), board_id uuid not null references public.boards(id),
  checkpoint text not null check(checkpoint in ('Q1','Q2','Q3','FINAL')),
  home_score int not null check(home_score >= 0), away_score int not null check(away_score >= 0),
  square_id uuid not null references public.squares(id), winner_id uuid not null references public.profiles(id),
  gross_cents bigint not null, commission_cents bigint not null, net_cents bigint not null,
  actor_id uuid not null references public.profiles(id), created_at timestamptz not null default now(),
  unique(board_id,checkpoint), check(gross_cents = commission_cents + net_cents)
);
create table public.audit_events (
  id bigint generated always as identity primary key, actor_id uuid references public.profiles(id),
  kind text not null, reference_id text not null, detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.games enable row level security;
alter table public.boards enable row level security;
alter table public.squares enable row level security;
alter table public.ledger enable row level security;
alter table public.deposits enable row level security;
alter table public.withdrawals enable row level security;
alter table public.settlements enable row level security;
alter table public.audit_events enable row level security;

create policy profile_read on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy games_read on public.games for select to authenticated using (true);
create policy boards_read on public.boards for select to authenticated using (true);
create policy squares_read on public.squares for select to authenticated using (true);
create policy ledger_read on public.ledger for select to authenticated using (user_id = (select auth.uid()));
create policy deposit_read on public.deposits for select to authenticated using (player_id = (select auth.uid()) or agent_id = (select auth.uid()) or exists(select 1 from public.profiles p where p.id = (select auth.uid()) and p.role='admin'));
create policy withdrawal_read on public.withdrawals for select to authenticated using (player_id = (select auth.uid()) or exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role in ('agent','admin')));
create policy settlement_read on public.settlements for select to authenticated using (true);

revoke all on all tables in schema public from anon, authenticated;
grant select on public.profiles, public.games, public.boards, public.squares, public.ledger, public.deposits, public.withdrawals, public.settlements to authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public;

create function public.balance_cents(p_user uuid) returns bigint language sql stable security definer set search_path = '' as $$
 select coalesce(sum(l.amount_cents),0)::bigint from public.ledger l where l.user_id = p_user
$$;
revoke all on function public.balance_cents(uuid) from public, anon, authenticated;

create function public.purchase_square(p_board uuid,p_row int,p_col int,p_key text)
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
revoke all on function public.purchase_square(uuid,int,int,text) from public, anon;
grant execute on function public.purchase_square(uuid,int,int,text) to authenticated;

create function public.request_withdrawal(p_amount bigint,p_key text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); result uuid;
begin
 if uid is null or not exists(select 1 from public.profiles where id=uid and role='player') or p_amount <= 0 or p_key is null or length(p_key)<12 then raise exception 'Invalid withdrawal'; end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
 if public.balance_cents(uid) < p_amount then raise exception 'Insufficient funds'; end if;
 insert into public.withdrawals(player_id,amount_cents) values(uid,p_amount) returning id into result;
 insert into public.ledger(user_id,kind,amount_cents,reference_type,reference_id,idempotency_key,actor_id)
 values(uid,'WITHDRAWAL_RESERVED',-p_amount,'withdrawal',result::text,p_key,uid);
 return result;
end $$;
revoke all on function public.request_withdrawal(bigint,text) from public, anon;
grant execute on function public.request_withdrawal(bigint,text) to authenticated;

create function public.resolve_withdrawal(p_id uuid,p_approve boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare w public.withdrawals%rowtype; uid uuid := auth.uid();
begin
 if uid is null or not exists(select 1 from public.profiles where id=uid and role in ('agent','admin')) then raise exception 'Agent or admin access required'; end if;
 update public.withdrawals set status=case when p_approve then 'PAID' else 'REJECTED' end,reviewer_id=uid,resolved_at=now()
 where id=p_id and status='PENDING' returning * into w;
 if not found then raise exception 'Withdrawal already resolved'; end if;
 if not p_approve then
   insert into public.ledger(user_id,kind,amount_cents,reference_type,reference_id,idempotency_key,actor_id)
   values(w.player_id,'WITHDRAWAL_REJECTED',w.amount_cents,'withdrawal',w.id::text,'withdrawal-refund:'||w.id,uid);
 end if;
end $$;
revoke all on function public.resolve_withdrawal(uuid,boolean) from public, anon;
grant execute on function public.resolve_withdrawal(uuid,boolean) to authenticated;

create function public.record_deposit(p_player uuid,p_amount bigint)
returns uuid language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); result uuid;
begin
 if uid is null or not exists(select 1 from public.profiles where id=uid and role='agent') or p_amount <= 0 or not exists(select 1 from public.profiles where id=p_player and role='player') then raise exception 'Invalid agent deposit'; end if;
 insert into public.deposits(player_id,agent_id,amount_cents) values(p_player,uid,p_amount) returning id into result;
 return result;
end $$;
revoke all on function public.record_deposit(uuid,bigint) from public, anon;
grant execute on function public.record_deposit(uuid,bigint) to authenticated;

create function public.resolve_deposit(p_id uuid,p_approve boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare d public.deposits%rowtype; uid uuid := auth.uid();
begin
 if uid is null or not exists(select 1 from public.profiles where id=uid and role='admin') then raise exception 'Admin access required'; end if;
 update public.deposits set status=case when p_approve then 'APPROVED' else 'REJECTED' end,reviewer_id=uid,resolved_at=now()
 where id=p_id and status='PENDING' and agent_id <> uid returning * into d;
 if not found then raise exception 'Deposit unavailable'; end if;
 if p_approve then
   perform pg_advisory_xact_lock(hashtextextended(d.player_id::text,0));
   insert into public.ledger(user_id,kind,amount_cents,reference_type,reference_id,idempotency_key,actor_id)
   values(d.player_id,'DEPOSIT_APPROVED',d.amount_cents,'deposit',d.id::text,'deposit:'||d.id,uid);
 end if;
end $$;
revoke all on function public.resolve_deposit(uuid,boolean) from public, anon;
grant execute on function public.resolve_deposit(uuid,boolean) to authenticated;

create function public.forfeit_square(p_square uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare s public.squares%rowtype; b public.boards%rowtype; g public.games%rowtype; uid uuid := auth.uid();
begin
 if uid is null then raise exception 'Sign in required'; end if;
 select * into s from public.squares where id=p_square;
 if s.owner_id is distinct from uid then raise exception 'Square unavailable'; end if;
 select * into b from public.boards where id=s.board_id for update;
 select * into g from public.games where id=b.game_id;
 if b.status <> 'OPEN' or b.drawn_at is not null or g.status <> 'scheduled' or g.kickoff_at <= now() then raise exception 'Forfeit window closed'; end if;
 delete from public.squares where id=s.id and owner_id=uid;
 if not found then raise exception 'Square unavailable'; end if;
 update public.boards set sold_count=sold_count-1 where id=b.id;
 insert into public.ledger(user_id,kind,amount_cents,reference_type,reference_id,idempotency_key,actor_id)
 values(uid,'FORFEIT_REFUND',b.price_cents,'square',s.id::text,'forfeit:'||s.id,uid);
end $$;
revoke all on function public.forfeit_square(uuid) from public, anon;
grant execute on function public.forfeit_square(uuid) to authenticated;

create function public.draw_numbers(p_board uuid)
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
revoke all on function public.draw_numbers(uuid) from public, anon;
grant execute on function public.draw_numbers(uuid) to authenticated;

create function public.cancel_board(p_board uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare b public.boards%rowtype; g public.games%rowtype; s public.squares%rowtype; uid uuid := auth.uid(); n int := 0;
begin
 if uid is null or not exists(select 1 from public.profiles where id=uid and role='admin') then raise exception 'Admin access required'; end if;
 select * into b from public.boards where id=p_board for update;
 select * into g from public.games where id=b.game_id;
 if b.status <> 'OPEN' or (g.status='live' and g.period <= 1) or g.status='scheduled' then raise exception 'Q1 not complete'; end if;
 update public.boards set status='CANCELLED' where id=p_board;
 for s in select * from public.squares where board_id=p_board loop
  insert into public.ledger(user_id,kind,amount_cents,reference_type,reference_id,idempotency_key,actor_id)
  values(s.owner_id,'BOARD_REFUND',b.price_cents,'square',s.id::text,'cancel:'||s.id,uid);
  n:=n+1;
 end loop;
 update public.boards set status='REFUNDED' where id=p_board;
 insert into public.audit_events(actor_id,kind,reference_id,detail) values(uid,'BOARD_CANCEL',p_board::text,jsonb_build_object('refunds',n));
 return n;
end $$;
revoke all on function public.cancel_board(uuid) from public, anon;
grant execute on function public.cancel_board(uuid) to authenticated;

create function public.settle_checkpoint(p_board uuid,p_checkpoint text,p_home int,p_away int)
returns uuid language plpgsql security definer set search_path = '' as $$
declare b public.boards%rowtype; g public.games%rowtype; s public.squares%rowtype; uid uuid := auth.uid();
 pot bigint; gross bigint; fee bigint; result uuid; seq int;
begin
 if uid is null or not exists(select 1 from public.profiles where id=uid and role='admin') then raise exception 'Admin access required'; end if;
 select * into b from public.boards where id=p_board for update;
 select * into g from public.games where id=b.game_id;
 if b.status not in ('LOCKED','LIVE','FINAL') or b.sold_count<>100 or b.drawn_at is null or p_home<0 or p_away<0 then raise exception 'Board unavailable'; end if;
 seq := case p_checkpoint when 'Q1' then 1 when 'Q2' then 2 when 'Q3' then 3 when 'FINAL' then 4 else 0 end;
 if seq=0 or (seq<4 and g.period<=seq and g.status<>'final') or (seq=4 and g.status<>'final') then raise exception 'Checkpoint unavailable'; end if;
 if seq>1 and not exists(select 1 from public.settlements where board_id=p_board and checkpoint=(array['Q1','Q2','Q3'])[seq-1]) then raise exception 'Prior checkpoint required'; end if;
 if exists(select 1 from public.settlements where board_id=p_board and checkpoint=p_checkpoint) then raise exception 'Already settled'; end if;
 select * into s from public.squares where board_id=p_board and row_index=array_position(b.home_digits,p_home%10)-1 and col_index=array_position(b.away_digits,p_away%10)-1;
 if not found then raise exception 'Winning square missing'; end if;
 pot:=b.price_cents*100;
 gross:=case when seq<4 then pot/5 else pot-3*(pot/5) end;
 fee:=gross*b.commission_bps/10000;
 insert into public.settlements(board_id,checkpoint,home_score,away_score,square_id,winner_id,gross_cents,commission_cents,net_cents,actor_id)
 values(p_board,p_checkpoint,p_home,p_away,s.id,s.owner_id,gross,fee,gross-fee,uid) returning id into result;
 perform pg_advisory_xact_lock(hashtextextended(s.owner_id::text,0));
 if gross>fee then
  insert into public.ledger(user_id,kind,amount_cents,reference_type,reference_id,idempotency_key,actor_id)
  values(s.owner_id,'CHECKPOINT_WIN',gross-fee,'settlement',result::text,'settle:'||p_board||':'||p_checkpoint,uid);
 end if;
 update public.boards set status=case when seq=4 then 'SETTLED' else 'LIVE' end where id=p_board;
 return result;
end $$;
revoke all on function public.settle_checkpoint(uuid,text,int,int) from public, anon;
grant execute on function public.settle_checkpoint(uuid,text,int,int) to authenticated;

create function public.create_board(p_game text,p_price bigint,p_commission int)
returns uuid language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); result uuid;
begin
 if uid is null or not exists(select 1 from public.profiles where id=uid and role='admin') then raise exception 'Admin access required'; end if;
 if not exists(select 1 from public.games where id=p_game and status='scheduled') then raise exception 'Game unavailable'; end if;
 insert into public.boards(game_id,price_cents,commission_bps)
 values(p_game,p_price,p_commission) returning id into result;
 return result;
end $$;
revoke all on function public.create_board(text,bigint,int) from public, anon;
grant execute on function public.create_board(text,bigint,int) to authenticated;

create function public.open_board(p_board uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
 if uid is null or not exists(select 1 from public.profiles where id=uid and role='admin') then raise exception 'Admin access required'; end if;
 update public.boards set status='OPEN' where id=p_board and status='DRAFT' and exists(select 1 from public.games where id=game_id and status='scheduled');
 if not found then raise exception 'Board unavailable'; end if;
end $$;
revoke all on function public.open_board(uuid) from public, anon;
grant execute on function public.open_board(uuid) to authenticated;

create function public.update_board_terms(p_board uuid,p_price bigint,p_commission int)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
 if uid is null or not exists(select 1 from public.profiles where id=uid and role='admin') then raise exception 'Admin access required'; end if;
 update public.boards set price_cents=p_price,commission_bps=p_commission
 where id=p_board and sold_count=0 and status in ('DRAFT','OPEN');
 if not found then raise exception 'Board terms locked'; end if;
end $$;
revoke all on function public.update_board_terms(uuid,bigint,int) from public, anon;
grant execute on function public.update_board_terms(uuid,bigint,int) to authenticated;
