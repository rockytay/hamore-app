-- Driving tasks for licence B: the official 52 tasks of the "כרטיס תלמיד" in 4 stages
-- (21 + 12 + 10 + 9), verified 17.11.2026. Also: a teacher can mark a task "not relevant"
-- (for example clutch tasks for an automatic car), and the green form is valid 5 years.
-- Safe to run more than once.

-- ---------------------------------------------------------------------------
-- The task list
-- ---------------------------------------------------------------------------

alter table public.driving_tasks
  add column if not exists license_category text not null default 'B',
  add column if not exists chapter          smallint not null default 1 check (chapter between 1 and 9),
  add column if not exists task_number      smallint not null default 1 check (task_number between 1 and 99),
  add column if not exists code             text;

create unique index if not exists driving_tasks_code_key
  on public.driving_tasks (license_category, code);

-- Ids 1-52 follow the official order, so they stay stable when a wording changes.
insert into public.driving_tasks (id, stage, chapter, task_number, sort_order, code, title) values
  (1, 1, 1, 1, 1, '1.1.1', 'כניסה לרכב ויציאה ממנו'),
  (2, 1, 1, 2, 2, '1.1.2', 'מערכת התפעול'),
  (3, 1, 1, 3, 3, '1.1.3', 'מערכות הבטיחות'),
  (4, 1, 1, 4, 4, '1.1.4', 'מערכת הבקרה והמידע'),
  (5, 1, 1, 5, 5, '1.1.5', 'ישיבה נכונה ופעולות הכנה לנסיעה'),
  (6, 1, 1, 6, 6, '1.1.6', 'התנעת מנוע'),
  (7, 1, 1, 7, 7, '1.1.7', 'תחילת נסיעה והאצה בהילוך ראשון במישור'),
  (8, 1, 1, 8, 8, '1.1.8', 'האטה ועצירה בהילוך ראשון'),
  (9, 1, 1, 9, 9, '1.1.9', 'אבטחת הרכב והדממת המנוע בסיום הנסיעה'),
  (10, 1, 2, 1, 10, '1.2.1', 'היגוי בקו ישר'),
  (11, 1, 2, 2, 11, '1.2.2', 'היגוי בהפניות הרכב'),
  (12, 1, 2, 3, 12, '1.2.3', 'העלאת הילוכים'),
  (13, 1, 2, 4, 13, '1.2.4', 'הורדת הילוכים (מ-5 עד 2)'),
  (14, 1, 2, 5, 14, '1.2.5', 'עצירת הרכב בכל הילוך ומכל הילוך'),
  (15, 1, 3, 1, 15, '1.3.1', 'נסיעה במהירות נמוכה בעזרת המצמד'),
  (16, 1, 3, 2, 16, '1.3.2', 'הורדה מהילוך שני להילוך ראשון בעת נסיעה'),
  (17, 1, 3, 3, 17, '1.3.3', 'עצירת מטרה בנסיעה קדימה'),
  (18, 1, 3, 4, 18, '1.3.4', 'תחילת נסיעה במורד ונסיעה במהירות נמוכה מאוד'),
  (19, 1, 3, 5, 19, '1.3.5', 'תחילת נסיעה במעלה תוך שימוש בבלם העזר (בלם יד)'),
  (20, 1, 3, 6, 20, '1.3.6', 'תחילת נסיעה במעלה ללא שימוש בבלם העזר ונסיעה במהירות נמוכה מאוד'),
  (21, 1, 3, 7, 21, '1.3.7', 'תחילת נסיעה לאחור בקו ישר'),
  (22, 2, 1, 1, 22, '2.1.1', 'הרגלי הסתכלות נכונים'),
  (23, 2, 1, 2, 23, '2.1.2', 'נסיעה בימין הכביש'),
  (24, 2, 1, 3, 24, '2.1.3', 'החלפת נתיבים'),
  (25, 2, 1, 4, 25, '2.1.4', 'עצירה וחנייה בימין הכביש או בשמאלו'),
  (26, 2, 2, 1, 26, '2.2.1', 'התקרבות לצמתים, מיקום וחצייה'),
  (27, 2, 2, 2, 27, '2.2.2', 'פניות ימינה'),
  (28, 2, 2, 3, 28, '2.2.3', 'פניות שמאלה'),
  (29, 2, 2, 4, 29, '2.2.4', 'פניות פרסה'),
  (30, 2, 3, 1, 30, '2.3.1', 'עצירת מטרה בנסיעה לאחור'),
  (31, 2, 3, 2, 31, '2.3.2', 'הפניות הרכב בנסיעה לאחור'),
  (32, 2, 3, 3, 32, '2.3.3', 'חנייה בנסיעה לאחור בין שני כלי רכב בימין הכביש או בשמאלו'),
  (33, 2, 3, 4, 33, '2.3.4', 'יציאה ממקום חסום'),
  (34, 3, 1, 1, 34, '3.1.1', 'מהירות הנסיעה'),
  (35, 3, 1, 2, 35, '3.1.2', 'שמירת רווח'),
  (36, 3, 1, 3, 36, '3.1.3', 'התנהגות נוהג רכב שנעקף'),
  (37, 3, 1, 4, 37, '3.1.4', 'עקיפת רכב נוסע'),
  (38, 3, 2, 1, 38, '3.2.1', 'מתן זכות קדימה בדרך (לא בצומת)'),
  (39, 3, 2, 2, 39, '3.2.2', 'מתן זכות קדימה בצומת שאינו מתומרר ואינו מרומזר'),
  (40, 3, 2, 3, 40, '3.2.3', 'מתן זכות קדימה בצומת בו מוצבים תמרורי זכות קדימה'),
  (41, 3, 2, 4, 41, '3.2.4', 'מתן זכות קדימה בצומת מרומזר'),
  (42, 3, 2, 5, 42, '3.2.5', 'התאמת הנהיגה להולכי רגל'),
  (43, 3, 2, 6, 43, '3.2.6', 'חניה בהתאם לסימונים על פני הדרך'),
  (44, 4, 1, 1, 44, '4.1.1', 'נהיגה בדרכים שאינן עירוניות במהירויות גבוהות'),
  (45, 4, 1, 2, 45, '4.1.2', 'פעולות במקרה של סכנה פתאומית'),
  (46, 4, 1, 3, 46, '4.1.3', 'ירידה מכוונת / רצונית לשוליים וחזרה לכביש'),
  (47, 4, 1, 4, 47, '4.1.4', 'ירידת חירום לשוליים וחזרה לכביש'),
  (48, 4, 1, 5, 48, '4.1.5', 'נהיגה בדרכים הרריות, צרות ומעוקלות'),
  (49, 4, 2, 1, 49, '4.2.1', 'הימנעות מהחלקה והיחלצות ממנה'),
  (50, 4, 2, 2, 50, '4.2.2', 'התייחסות לרכב ביטחון'),
  (51, 4, 2, 3, 51, '4.2.3', 'התנהגות במפגש מסילת ברזל'),
  (52, 4, 2, 4, 52, '4.2.4', 'נהיגה בזמן תאורה')
on conflict (id) do update set
  stage       = excluded.stage,
  chapter     = excluded.chapter,
  task_number = excluded.task_number,
  sort_order  = excluded.sort_order,
  code        = excluded.code,
  title       = excluded.title;

-- ---------------------------------------------------------------------------
-- "Not relevant" status
-- ---------------------------------------------------------------------------

alter table public.student_task_progress
  drop constraint if exists student_task_progress_status_check;
alter table public.student_task_progress
  add constraint student_task_progress_status_check
  check (status in ('practicing', 'mastered', 'not_relevant'));

-- ---------------------------------------------------------------------------
-- Green form (medical declaration) is valid 5 years (gov.il), not 3
-- ---------------------------------------------------------------------------

-- Teachers still on the old default of 3 move to 5. This runs only while the column
-- default is still 3, so running the file again never undoes a teacher's own choice.
do $$
begin
  if (select column_default from information_schema.columns
       where table_schema = 'public' and table_name = 'profiles'
         and column_name = 'green_form_valid_years') = '3' then
    update public.profiles set green_form_valid_years = 5
     where role = 'teacher' and green_form_valid_years = 3;
  end if;
end
$$;

alter table public.profiles alter column green_form_valid_years set default 5;
