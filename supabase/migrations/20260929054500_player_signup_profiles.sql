create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into public.profiles(id,display_name,role)
 values(new.id,coalesce(nullif(split_part(new.email,'@',1),''),'Player'),'player');
 return new;
end $$;
revoke all on function public.handle_new_user() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
