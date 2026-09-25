alter table galleries
add column cover_layout text check (cover_layout in ('tap-chi', 'toi-gian', 'ben-canh', 'de-cheo'));
