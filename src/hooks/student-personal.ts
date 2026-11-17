/**
 * The student's own details, kept on their account: birth date, language, reminder
 * preferences, pickup addresses, contacts and weekly availability.
 * The student edits them; their current teacher can read and correct them (row-level
 * security decides, see supabase/migrations/20261117120000_student_file.sql).
 */
import {
  parseDay,
  toDayString,
  type Address,
  type AvailabilityWindow,
  type Contact,
  type ContactKind,
  type Language,
  type ReminderChannel,
  type StudentPersonal,
} from '@/hooks/student-file';
import { supabase } from '@/lib/supabase';

type AddressRow = {
  id: string;
  label: string;
  street: string;
  house_number: string;
  city: string;
  pickup_notes: string;
  is_default: boolean;
};

type ContactRow = {
  id: string;
  kind: ContactKind;
  name: string;
  phone: string;
  relation: string;
  is_payer: boolean;
};

type AvailabilityRow = { id: string; weekday: number; start_min: number; end_min: number };

export type PersonalRow = {
  id: string;
  email: string;
  birth_date: string | null;
  preferred_language: Language;
  reminder_channel: ReminderChannel;
  reminder_hours_before: number;
  student_addresses: AddressRow[];
  student_contacts: ContactRow[];
  student_availability: AvailabilityRow[];
};

/** Columns of public.profiles with the student's addresses, contacts and availability. */
export const PERSONAL_COLUMNS =
  'id, email, birth_date, preferred_language, reminder_channel, reminder_hours_before, ' +
  'student_addresses(id, label, street, house_number, city, pickup_notes, is_default), ' +
  'student_contacts(id, kind, name, phone, relation, is_payer), ' +
  'student_availability(id, weekday, start_min, end_min)';

export function toPersonal(row: PersonalRow): StudentPersonal {
  return {
    profileId: row.id,
    email: row.email,
    birthDate: parseDay(row.birth_date),
    language: row.preferred_language,
    reminderChannel: row.reminder_channel,
    reminderHoursBefore: row.reminder_hours_before,
    addresses: [...row.student_addresses]
      .sort((a, b) => Number(b.is_default) - Number(a.is_default))
      .map((a) => ({
        id: a.id,
        label: a.label,
        street: a.street,
        houseNumber: a.house_number,
        city: a.city,
        pickupNotes: a.pickup_notes,
        isDefault: a.is_default,
      })),
    contacts: row.student_contacts.map((c) => ({
      id: c.id,
      kind: c.kind,
      name: c.name,
      phone: c.phone,
      relation: c.relation,
      isPayer: c.is_payer,
    })),
    availability: [...row.student_availability]
      .sort((a, b) => a.weekday - b.weekday || a.start_min - b.start_min)
      .map((w) => ({ id: w.id, weekday: w.weekday, startMin: w.start_min, endMin: w.end_min })),
  };
}

/** The signed-in student's own details. */
export async function fetchMyPersonal(userId: string): Promise<StudentPersonal | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select(PERSONAL_COLUMNS)
    .eq('id', userId)
    .single<PersonalRow>();
  if (error || !data) return null;
  return toPersonal(data);
}

const SAVE_FAILED = 'השמירה נכשלה. יש לבדוק את החיבור ולנסות שוב.';

export type ProfileChanges = Partial<
  Pick<StudentPersonal, 'birthDate' | 'language' | 'reminderChannel' | 'reminderHoursBefore'>
>;

/** Only the student changes these (their own account). Returns an error in Hebrew, or null. */
export async function updateMyProfile(userId: string, changes: ProfileChanges) {
  const columns: Record<string, unknown> = {};
  if (changes.birthDate !== undefined) columns.birth_date = toDayString(changes.birthDate);
  if (changes.language !== undefined) columns.preferred_language = changes.language;
  if (changes.reminderChannel !== undefined) columns.reminder_channel = changes.reminderChannel;
  if (changes.reminderHoursBefore !== undefined) columns.reminder_hours_before = changes.reminderHoursBefore;
  const { error } = await supabase.from('profiles').update(columns).eq('id', userId);
  return error ? SAVE_FAILED : null;
}

/** Adds an address (no id) or updates one. Making it the default clears the old default first. */
export async function saveAddress(profileId: string, address: Omit<Address, 'id'>, id?: string) {
  if (address.isDefault) {
    const cleared = await supabase
      .from('student_addresses')
      .update({ is_default: false })
      .eq('profile_id', profileId)
      .eq('is_default', true);
    if (cleared.error) return SAVE_FAILED;
  }
  const columns = {
    label: address.label.trim(),
    street: address.street.trim(),
    house_number: address.houseNumber.trim(),
    city: address.city.trim(),
    pickup_notes: address.pickupNotes.trim(),
    is_default: address.isDefault,
  };
  const { error } = id
    ? await supabase.from('student_addresses').update(columns).eq('id', id)
    : await supabase.from('student_addresses').insert({ ...columns, profile_id: profileId });
  return error ? SAVE_FAILED : null;
}

export async function saveContact(profileId: string, contact: Omit<Contact, 'id'>, id?: string) {
  const columns = {
    kind: contact.kind,
    name: contact.name.trim(),
    phone: contact.phone.trim(),
    relation: contact.relation.trim(),
    is_payer: contact.isPayer,
  };
  const { error } = id
    ? await supabase.from('student_contacts').update(columns).eq('id', id)
    : await supabase.from('student_contacts').insert({ ...columns, profile_id: profileId });
  return error ? SAVE_FAILED : null;
}

export async function addAvailability(profileId: string, window: Omit<AvailabilityWindow, 'id'>) {
  const { error } = await supabase.from('student_availability').insert({
    profile_id: profileId,
    weekday: window.weekday,
    start_min: window.startMin,
    end_min: window.endMin,
  });
  return error ? SAVE_FAILED : null;
}

export type PersonalTable = 'student_addresses' | 'student_contacts' | 'student_availability';

export async function deletePersonalRow(table: PersonalTable, id: string) {
  const { error } = await supabase.from(table).delete().eq('id', id);
  return error ? 'המחיקה נכשלה. יש לנסות שוב.' : null;
}
