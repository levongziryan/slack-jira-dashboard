-- Этап 2 (мультитенантность): данные привязываются к пользователю.
-- Идемпотентно: повторный запуск ничего не меняет. Существующие строки получают владельца
-- (самого раннего пользователя). Первичные ключи становятся ("userId","id"), так как id
-- (Slack ts и производные) у разных пользователей совпадают.
DO $mt$
DECLARE
  owner_id TEXT;
  t TEXT;
  pk TEXT;
  cnt BIGINT;
BEGIN
  SELECT "id" INTO owner_id FROM "User" ORDER BY "createdAt" ASC LIMIT 1;

  FOREACH t IN ARRAY ARRAY['Mention', 'SavedItem', 'Promise', 'PriorityRule', 'AnalyzedMessage'] LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'userId'
    ) THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN "userId" TEXT', t);
      IF owner_id IS NOT NULL THEN
        EXECUTE format('UPDATE %I SET "userId" = %L WHERE "userId" IS NULL', t, owner_id);
      END IF;
      EXECUTE format('SELECT count(*) FROM %I WHERE "userId" IS NULL', t) INTO cnt;
      IF cnt > 0 THEN
        RAISE EXCEPTION 'Таблица %: % строк без владельца, а пользователей нет', t, cnt;
      END IF;
      EXECUTE format('ALTER TABLE %I ALTER COLUMN "userId" SET NOT NULL', t);

      IF t <> 'PriorityRule' THEN
        SELECT conname INTO pk FROM pg_constraint
        WHERE conrelid = to_regclass(format('public.%I', t)) AND contype = 'p';
        IF pk IS NOT NULL THEN
          EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', t, pk);
        END IF;
        EXECUTE format('ALTER TABLE %I ADD CONSTRAINT %I PRIMARY KEY ("userId", "id")', t, t || '_pkey');
      END IF;

      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE',
        t, t || '_userId_fkey'
      );
    END IF;
  END LOOP;
END
$mt$;

CREATE INDEX IF NOT EXISTS "PriorityRule_userId_idx" ON "PriorityRule"("userId");
