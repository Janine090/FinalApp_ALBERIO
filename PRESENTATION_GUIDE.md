# QR Attendance App - Finals Presentation Guide

## 1. 30-second pitch

> "Our QR Attendance App replaces manual roll call with a fast, secure, role-based check-in system. Teachers create an event and generate a QR code. Students scan it with their phone, and their attendance is saved instantly to the cloud. Administrators get a campus-wide dashboard for users, events, and attendance, while students and teachers each get a focused experience. The app has a modern dashboard-style interface, secure sessions, and database-level security rules."

---

## 2. Before vs after

| Area | Before | After |
| --- | --- | --- |
| Visual style | Default white screens, mixed emoji icons, basic cards | Dark navy "IT dashboard" theme with cyan/violet accents, consistent Ionicons, custom SVG logo and background |
| Navigation | Same tabs for everyone | Role-aware tabs: students get Scan and History; teachers get Events and History; admins also get an Admin tab |
| Dashboard | Simple list of actions | Greeting, live stats, role-specific hero card, quick actions, recent activity, pull-to-refresh |
| Student flow | Scan and history only | Available-events screen with venue, schedule, live status, and a direct scan action |
| Teacher flow | Basic form and QR code | Event console with venue, description, status, editing, close-event control, QR sharing, and attendance viewer |
| Admin flow | None | Campus dashboard with real user/event/attendance totals, user role management, event oversight, and attendance correction |
| Attendance records | Checked-in only | Present / late / absent statuses, automatic 15-minute late rule, and admin correction |
| Scanner | Plain camera view | Animated scan frame, torch control, identity pill, permission screen, result sheet, staff guard |
| History | Basic list | Role-aware stats, student status timeline, expandable staff attendee lists, event status badges |
| Profile | Basic text | Avatar hero, editable display name, role-aware stats, account details, system info, sign-out confirmation |
| Auth | Plain forms | Branded login/register, password visibility, role cards, stronger validation, inline errors and success states |
| Session storage | AsyncStorage | Chunked Expo SecureStore adapter with automatic token refresh |
| Security | UI-level role checks | Database RLS policies, staff-only event management, admin-only role changes, DB time validation, protected role trigger, duplicate prevention |
| Code structure | Repeated screen styles | Shared design tokens and reusable UI components |

---

## 3. What the app does

### Student
- Registers or logs in.
- Sees a personal dashboard with check-in count, open events, and monthly activity.
- Browses available events with venue, schedule, and live/upcoming status.
- Opens the scanner and scans the teacher's event QR.
- Gets a clear success, duplicate, early, late, or invalid-code message.
- Reviews attendance history with event, venue, date, and present/late status.
- Edits display name and signs out securely.

### Teacher
- Registers or logs in as a teacher.
- Creates an event with a title, venue, description, date, start time, end time, and auto-generated event code.
- Edits event details later without changing the QR code.
- Generates a QR code, shares it with students, and closes the event when finished.
- Views attendee names, scan times, and present/late statuses.
- Monitors check-ins in the History tab.
- Edits profile and signs out securely.

### Administrator
- Is promoted from a normal account in the Supabase SQL Editor; admin is not a public signup role.
- Sees real campus totals for students, teachers, admins, events, live events, check-ins, and attendance rate.
- Searches accounts and changes a user between student, teacher, and admin.
- Oversees every event, opens the event console, and closes sessions.
- Reviews recent attendance and corrects records to present, late, or absent.
- Sees the most-attended sessions without any demo or hardcoded numbers.

---

## 4. Tech stack

- **Expo SDK 57 + React Native** - cross-platform mobile app.
- **Expo Router** - file-based navigation and protected tab routes.
- **TypeScript** - strict typing for screens, data, and components.
- **Supabase Auth** - email/password accounts and session management.
- **Supabase Postgres** - events, profiles, and attendance data.
- **Row Level Security (RLS)** - server-side access rules.
- **Expo SecureStore** - encrypted native session storage.
- **expo-camera** - QR scanning.
- **react-native-qrcode-svg** - QR generation.
- **@expo/vector-icons (Ionicons)** - consistent icon system.
- **react-native-reanimated** - scan animation and screen fade-ins.

---

## 5. Project structure

```text
app/
  _layout.tsx          Root stack, session redirect, loading screen
  login.tsx            Branded login
  register.tsx         Branded registration with role selection
  available-events.tsx Student event discovery
  (tabs)/
    _layout.tsx        Role-aware floating tab bar
    index.tsx          Role-specific dashboard
    teacher.tsx        Event create/edit/close + QR console
    scan.tsx           Camera scanner + attendance result
    history.tsx        Student/staff attendance log
    admin.tsx          Campus administration dashboard
    profile.tsx        Profile and account settings

components/
  ProfileProvider.tsx  Shared profile/role context
  AppButton.tsx        Button variants
  ui/                  Design-system components (including StatusBadge)

constants/
  colors.ts            Color palette
  theme.ts             Spacing, radius, typography, shadows

lib/
  supabase.ts          Supabase client + secure session storage + token refresh
  secureStorage.ts     Chunked SecureStore adapter
  auth.ts              Sign-in, sign-up, sign-out, profile sync, error messages
  profiles.ts          Profile queries, role updates
  events.ts            Event CRUD, status derivation, available events
  attendance.ts        Attendance registration, history, staff logs
  admin.ts             Admin statistics, users, events, attendance correction
  validation.ts        Email, password, and event validation
  qr.ts                QR payload build/parse

supabase/
  schema.sql           Tables, triggers, RLS policies
```

---

## 6. How the QR flow works

1. The teacher enters the event details.
2. The app creates a random event code, for example `A1B2C3D4`.
3. The event row is saved in Supabase with the teacher's user ID, start time, and end time.
4. The app builds a JSON payload:

   ```json
   {
     "v": 1,
     "event": "A1B2C3D4",
     "title": "Finals Demo",
     "start": "2026-10-25T09:00:00.000Z",
     "end": "2026-10-25T10:00:00.000Z"
   }
   ```

5. `react-native-qrcode-svg` renders the payload as a QR code.
6. A student scans the QR with `expo-camera`.
7. The app parses the payload and fetches the event from Supabase by event code.
8. The app checks the **database** event status and start/end times, so a modified QR cannot bypass the event window or a closed event.
9. The app inserts one attendance row for the signed-in student.
10. A unique constraint `(student_id, event_id)` prevents duplicate check-ins.
11. A database trigger marks a check-in as **late** after the first 15 minutes; admins can later correct the status.
12. The result is shown as a success, duplicate, early, late, closed, or invalid message.

---

## 7. Security and data integrity

These are the strongest engineering talking points:

- **Authentication required** - attendance and event data require a signed-in Supabase user.
- **Secure session storage** - tokens are stored in encrypted SecureStore, not plain AsyncStorage. The adapter splits large tokens into chunks because SecureStore has a value size limit.
- **Automatic token refresh** - the Supabase client refreshes sessions when the app returns to the foreground.
- **Database-level roles** - `public.is_student(uid)`, `public.is_teacher(uid)`, `public.is_admin(uid)`, and `public.is_staff(uid)` resolve roles on the server. Only staff can create or update events, only students can check in, and only admins can change roles.
- **RLS on all tables** - students can read their own attendance, teachers can read attendance and attendee profiles for events they created, and admins can read and manage all records.
- **Protected role changes** - a trigger blocks non-admin users from promoting themselves or changing another account's role, even if they call the API directly.
- **Status integrity** - attendance accepts only `present`, `late`, or `absent`; a trigger derives late status after 15 minutes, and only admins can correct records.
- **Event lifecycle** - events move through `upcoming`, `active`, and `closed`; closing an event blocks new scans even if an old QR is shared.
- **Duplicate prevention** - a database unique constraint plus handling of error code `23505` stops double check-ins.
- **Server-side time validation** - the app uses the event's stored start/end times, not only the QR payload.
- **No unknown-event creation** - scanning a QR for an event that does not exist returns a clear invalid-code message instead of creating an event from the student's device.
- **UI guards** - students do not see the Events or Admin tabs, staff do not see the Scan tab, and direct access to a restricted screen shows a locked state.
- **No secret keys in the app** - only the Supabase publishable/anon key is used. The service role key is never shipped.

> Important: run the updated `supabase/schema.sql` in the Supabase SQL Editor once. It adds `events.venue`, `events.description`, `events.status`, `attendance.status`, admin role support, the role-protection trigger, and the new RLS policies. Existing data is preserved.
>
> Then promote your admin account from the SQL Editor:
>
> ```sql
> update public.profiles
> set role = 'admin'
> where email = 'admin@your-school.edu';
> ```

---

## 8. UI/UX design decisions

Use this section when explaining the redesign:

- **Dashboard-first layout** - information is grouped into stats, primary action, quick actions, and recent activity instead of one long list.
- **Consistent color system** - one palette in `constants/colors.ts`; cyan is the primary action, violet is secondary, green is success, red is error.
- **Design tokens** - spacing, radius, typography, and shadows live in `constants/theme.ts`, so screens look consistent and are easier to maintain.
- **Reusable components** - `Card`, `Badge`, `StatCard`, `FormField`, `EmptyState`, `ScreenHeader`, etc. reduce duplicated styles.
- **Icon system** - Ionicons are used everywhere instead of emoji; a custom SVG logo and background give the app a product identity.
- **Monospace details** - event codes, dates, and IDs use a monospace font to create the "technical dashboard" feel.
- **Motion with purpose** - fade-in sections, animated scan laser, and pulsing result states guide attention without slowing the user down.
- **Role-aware navigation** - the tab bar changes per role, so users only see relevant actions.
- **Clear feedback** - every important action has a loading state, success state, or readable error message.

---

## 9. Live demo script (about 7 minutes)

### Before the demo
- Run the updated `supabase/schema.sql` in the Supabase SQL Editor.
- Prepare one student, one teacher, and one admin account. Promote the admin account with the SQL command above.
- Prepare two devices if possible: one staff device and one student device.
- Make sure both devices have internet.
- Test one full flow before presenting: create event, scan, check history, scan again, then open the admin dashboard.

### Demo steps

1. **Login as teacher**
   - Point out the branded login screen and the "Secure / Cloud logs" badges.
   - Log in.
   - On the dashboard, point out the greeting, stats, hero card, quick actions, and recent activity.
   - Point out the tab bar: Events, History, Profile. There is no Scan tab for teachers.

2. **Create an event**
   - Open Events.
   - Show the auto-generated event code.
   - Enter a title such as "Finals Demo", a venue, and a short description.
   - Pick today's date and a start/end time that includes the current time.
   - Point out the duration chips.
   - Tap Create & Generate QR.
   - Show the QR card and event details. Tap Share if you want to show the share sheet.
   - Demonstrate Edit and explain that the event code stays locked for QR compatibility.
   - Mention the Close action and that it stops new check-ins.

3. **Login as student**
   - On the second device, log in with the student account.
   - Point out the dashboard differences: check-in count, open events, monthly activity, and a Scan tab.
   - Open Available Events to show venue, schedule, and live/upcoming status.

4. **Scan the QR**
   - Open Scan.
   - Grant camera permission if asked.
   - Point out the identity pill, animated scan frame, and torch toggle.
   - Scan the teacher's QR.
   - Show the success result and event title.
   - Scan the same QR again and show the duplicate message.

5. **Show history**
   - On the student device, open History and show the event, venue, scan time, and present/late badge.
   - On the staff device, open History and expand the event.
   - Show attendee names, scan times, and attendance statuses.

6. **Show admin control**
   - Sign in with the promoted admin account.
   - Open Admin and point out real totals, attendance rate, present/late/absent counts, and top sessions.
   - Search for the student account, open Change role, and show the role options.
   - Open Events in the admin dashboard and demonstrate closing a session.
   - Open Attendance and demonstrate correcting a record's status.
   - Explain that admin role changes are blocked for non-admins in the database.

7. **Show profile**
   - Open Profile.
   - Edit the display name and save.
   - Show role-aware account details and system information.
   - Tap Sign out and show the confirmation dialog.

8. **Close strongly**
   - "This is not just a prettier UI. It is a complete attendance workflow with three roles, secure sessions, database-enforced permissions, event lifecycle controls, and auditable attendance records."

---

## 10. How to run

```bash
npm install
npx expo start -c
```

Then open the app in Expo Go or your development build.

- `-c` clears the Metro cache. Run it after changing `.env`.
- If you build an APK, `EXPO_PUBLIC_*` values are baked in at build time.
- For a preview APK, use your existing EAS setup, for example:

```bash
npx eas build -p android --profile preview
```

Verification commands used during development:

```bash
npx tsc --noEmit
npx expo export --platform web
```

---

## 11. Q&A cheat sheet

**Why did you use Supabase?**
It gives us authentication, a Postgres database, and row-level security without building a separate backend. That let us focus on the mobile experience and security rules.

**How do you prevent fake attendance?**
A student must be signed in. Attendance is tied to `auth.uid()`. The event must exist in the database, the event time window is checked from the database, and the unique constraint prevents duplicates.

**What if a student shares the QR code?**
The event time window limits when it works, and each student can only check in once. A future version can use rotating QR codes or a short-lived signed token.

**How are student, teacher, and admin roles enforced?**
The UI hides screens that do not belong to the signed-in role, and the database enforces access with `is_teacher`, `is_staff`, and `is_admin` checks inside RLS policies. A trigger also blocks non-admins from changing profile roles. Hiding a tab alone is not enough.

**How does the admin account exist if admin is not a signup role?**
A normal account signs up first, then a project owner promotes it with an `update public.profiles set role = 'admin'` statement in the Supabase SQL Editor. This prevents anyone from self-registering as an administrator.

**How is the session kept secure?**
Supabase session data is stored with Expo SecureStore, which uses encrypted native storage. The app also refreshes the session when it returns to the foreground.

**What happens if the same student scans twice?**
The database unique constraint rejects the second insert. The app detects error code `23505` and shows "Already registered for this event."

**Why not just use AsyncStorage?**
AsyncStorage is not encrypted. SecureStore is the safer choice for authentication tokens.

**Does the app work offline?**
It needs internet for authentication and saving attendance. A future version could queue scans locally and sync when the connection returns.

**What was the biggest UI improvement?**
The app moved from separate basic screens to one consistent design system: shared colors, spacing, typography, reusable cards and buttons, consistent icons, role-aware navigation, and clear feedback states.

**What is the biggest technical improvement?**
Security moved from UI-only checks to database-enforced rules, and the check-in flow now validates the event against the database instead of trusting the QR payload.

---

## 12. Limitations and future work

Be honest about these if asked:

- Attendance updates require pull-to-refresh or revisiting the screen; realtime subscriptions can be added next.
- QR payloads are not cryptographically signed yet; rotating/signed codes would make sharing harder.
- No geofencing or device binding yet.
- No CSV/PDF export yet.
- Admin accounts are bootstrapped through SQL rather than an invitation flow.
- Large campuses may need pagination and server-side search for the user directory.
- No offline queue yet.

These are good "next steps" because they show you understand the system and have a roadmap.

---

## 13. Cebuano quick script

You can say it like this:

> "Sa una, plain screens ra kaayo ang app ug parehas ra ang makita sa teacher ug student. Karon, gi-redesign nako siya into a dark dashboard-style UI with consistent icons, reusable components, ug role-based navigation. Ang student naay available events, scanner, ug attendance history. Ang teacher naay event console with edit, close, QR generator, ug attendee logs. Ang admin naay campus dashboard para sa users, events, ug attendance records. Ako pud gi-improve ang security: naka-SecureStore ang session, naay RLS sa Supabase, staff-only ang event creation, admin-only ang role changes, gi-check ang event time ug status sa database, ug naay duplicate prevention. So ang app karon mas nindot tan-awon, mas klaro ang flow, ug mas secure."

---

## 14. One-line closing statement

> "This project is not just a prettier UI. It is a complete attendance workflow with role-based experiences, secure authentication, and database-enforced rules."
