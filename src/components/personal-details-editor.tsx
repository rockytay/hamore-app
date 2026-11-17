import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import {
  ChoiceChips,
  FieldHint,
  formStyles,
  LinkButton,
  optionsOf,
  TextField,
  ToggleRow,
} from '@/components/form-ui';
import { Button, Card, EmptyText, Section } from '@/components/student-ui';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import {
  CONTACT_KIND_LABELS,
  formatAddress,
  formatMinutes,
  getNavigationUrl,
  parseMinutes,
  WEEKDAY_LABELS,
  type Address,
  type Contact,
  type ContactKind,
  type StudentPersonal,
} from '@/hooks/student-file';
import {
  addAvailability,
  deletePersonalRow,
  saveAddress,
  saveContact,
} from '@/hooks/student-personal';
import { isValidPhone } from '@/hooks/use-students';
import { confirmAction, showMessage } from '@/utils/dialogs';

/**
 * Pickup addresses, contacts and weekly availability. Used by the student (their own
 * profile) and by the teacher (to read and correct a student's details).
 */
export function PersonalDetailsEditor({
  personal,
  onChanged,
  readOnly = false,
  audience,
}: {
  personal: StudentPersonal;
  /** Called after every change so the screen loads the details again. */
  onChanged: () => Promise<void> | void;
  readOnly?: boolean;
  audience: 'teacher' | 'student';
}) {
  return (
    <>
      <AddressesSection personal={personal} onChanged={onChanged} readOnly={readOnly} audience={audience} />
      <ContactsSection personal={personal} onChanged={onChanged} readOnly={readOnly} />
      <AvailabilitySection personal={personal} onChanged={onChanged} readOnly={readOnly} />
    </>
  );
}

type SectionProps = {
  personal: StudentPersonal;
  onChanged: () => Promise<void> | void;
  readOnly: boolean;
};

/** Runs a save; on success reloads, on failure shows the error. Returns true on success. */
async function run(action: Promise<string | null>, onChanged: SectionProps['onChanged']) {
  const error = await action;
  if (error) {
    showMessage('שגיאה', error);
    return false;
  }
  await onChanged();
  return true;
}

function remove(title: string, action: () => Promise<string | null>, onChanged: SectionProps['onChanged']) {
  confirmAction(title, 'למחוק?', 'מחיקה', () => run(action(), onChanged));
}

// ---------------------------------------------------------------------------
// Addresses
// ---------------------------------------------------------------------------

const EMPTY_ADDRESS: Omit<Address, 'id'> = {
  label: '',
  street: '',
  houseNumber: '',
  city: '',
  pickupNotes: '',
  isDefault: false,
};

function AddressesSection({ personal, onChanged, readOnly, audience }: SectionProps & { audience: string }) {
  // null: closed; 'new': adding; an id: editing that address.
  const [editing, setEditing] = useState<string | null>(null);
  const editingAddress = personal.addresses.find((a) => a.id === editing);

  return (
    <Section
      title="כתובות איסוף"
      action={!readOnly && editing === null ? <LinkButton label="+ הוספה" onPress={() => setEditing('new')} /> : null}>
      {personal.addresses.length === 0 && editing === null && (
        <EmptyText>
          {audience === 'student'
            ? 'עדיין לא הוספת כתובת איסוף. המורה ישתמש בה כדי לאסוף אותך לשיעור.'
            : 'התלמיד/ה עדיין לא הוסיף/ה כתובת איסוף.'}
        </EmptyText>
      )}
      {personal.addresses.map((address) =>
        address.id === editing ? null : (
          <Card key={address.id}>
            <View style={styles.itemHeader}>
              <ThemedText type="smallBold" style={styles.flex}>
                {address.label || 'כתובת'}
                {address.isDefault ? ' · ברירת מחדל' : ''}
              </ThemedText>
              {!readOnly && editing === null && (
                <View style={styles.itemActions}>
                  <LinkButton label="עריכה" onPress={() => setEditing(address.id)} />
                  <LinkButton
                    label="מחיקה"
                    danger
                    onPress={() =>
                      remove('מחיקת כתובת', () => deletePersonalRow('student_addresses', address.id), onChanged)
                    }
                  />
                </View>
              )}
            </View>
            <ThemedText type="small">{formatAddress(address)}</ThemedText>
            {address.pickupNotes ? (
              <ThemedText type="small" themeColor="textSecondary">
                {address.pickupNotes}
              </ThemedText>
            ) : null}
            <LinkButton label="ניווט ↗" onPress={() => Linking.openURL(getNavigationUrl(address))} />
          </Card>
        )
      )}
      {editing !== null && (
        <AddressForm
          key={editing}
          initial={editingAddress ?? { ...EMPTY_ADDRESS, isDefault: personal.addresses.length === 0 }}
          onCancel={() => setEditing(null)}
          onSave={async (address) => {
            const saved = await run(
              saveAddress(personal.profileId, address, editingAddress?.id),
              onChanged
            );
            if (saved) setEditing(null);
          }}
        />
      )}
    </Section>
  );
}

function AddressForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: Omit<Address, 'id'>;
  onSave: (address: Omit<Address, 'id'>) => Promise<void>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const change = (changes: Partial<Omit<Address, 'id'>>) => setDraft((d) => ({ ...d, ...changes }));

  const save = async () => {
    if (!draft.street.trim() || !draft.city.trim()) {
      setError('יש למלא רחוב ועיר');
      return;
    }
    setBusy(true);
    await onSave(draft);
    setBusy(false);
  };

  return (
    <Card style={styles.form}>
      <ChoiceChips
        options={['בית', 'בית ספר', 'עבודה', 'בית הורה שני'].map((label) => ({ value: label, label }))}
        value={draft.label}
        onChange={(label) => change({ label: label ?? '' })}
        allowNone
      />
      <View style={formStyles.row}>
        <View style={[formStyles.rowItem, styles.street]}>
          <TextField label="רחוב" value={draft.street} onChange={(street) => change({ street })} error={error} />
        </View>
        <View style={formStyles.rowItem}>
          <TextField label="מספר" value={draft.houseNumber} onChange={(houseNumber) => change({ houseNumber })} />
        </View>
      </View>
      <TextField label="עיר" value={draft.city} onChange={(city) => change({ city })} />
      <TextField
        label="הערות לאיסוף"
        value={draft.pickupNotes}
        onChange={(pickupNotes) => change({ pickupNotes })}
        placeholder="למשל: ליד השער האחורי"
      />
      <ToggleRow
        label="כתובת איסוף ברירת מחדל"
        value={draft.isDefault}
        onChange={(isDefault) => change({ isDefault })}
      />
      <View style={formStyles.row}>
        <View style={formStyles.rowItem}>
          <Button label="שמירה" onPress={save} busy={busy} />
        </View>
        <View style={formStyles.rowItem}>
          <Button label="ביטול" variant="secondary" onPress={onCancel} />
        </View>
      </View>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

const EMPTY_CONTACT: Omit<Contact, 'id'> = { kind: 'parent', name: '', phone: '', relation: '', isPayer: false };

function ContactsSection({ personal, onChanged, readOnly }: SectionProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const editingContact = personal.contacts.find((c) => c.id === editing);

  return (
    <Section
      title="הורה ואנשי קשר"
      action={!readOnly && editing === null ? <LinkButton label="+ הוספה" onPress={() => setEditing('new')} /> : null}>
      {personal.contacts.length === 0 && editing === null && <EmptyText>אין אנשי קשר.</EmptyText>}
      {personal.contacts.map((contact) =>
        contact.id === editing ? null : (
          <Card key={contact.id}>
            <View style={styles.itemHeader}>
              <ThemedText type="smallBold" style={styles.flex}>
                {contact.name}
                {contact.relation ? ` · ${contact.relation}` : ''}
              </ThemedText>
              {!readOnly && editing === null && (
                <View style={styles.itemActions}>
                  <LinkButton label="עריכה" onPress={() => setEditing(contact.id)} />
                  <LinkButton
                    label="מחיקה"
                    danger
                    onPress={() =>
                      remove('מחיקת איש קשר', () => deletePersonalRow('student_contacts', contact.id), onChanged)
                    }
                  />
                </View>
              )}
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              {CONTACT_KIND_LABELS[contact.kind]}
              {contact.isPayer ? ' · משלם/ת על השיעורים' : ''}
            </ThemedText>
            <LinkButton
              label={contact.phone}
              onPress={() => Linking.openURL(`tel:${contact.phone.replace(/\D/g, '')}`)}
            />
          </Card>
        )
      )}
      {editing !== null && (
        <ContactForm
          key={editing}
          initial={editingContact ?? EMPTY_CONTACT}
          onCancel={() => setEditing(null)}
          onSave={async (contact) => {
            const saved = await run(saveContact(personal.profileId, contact, editingContact?.id), onChanged);
            if (saved) setEditing(null);
          }}
        />
      )}
    </Section>
  );
}

function ContactForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: Omit<Contact, 'id'>;
  onSave: (contact: Omit<Contact, 'id'>) => Promise<void>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const change = (changes: Partial<Omit<Contact, 'id'>>) => setDraft((d) => ({ ...d, ...changes }));

  const save = async () => {
    if (!draft.name.trim()) return setError('יש למלא שם');
    if (!isValidPhone(draft.phone)) return setError('יש להזין מספר נייד תקין (05X-XXXXXXX)');
    setError(null);
    setBusy(true);
    await onSave(draft);
    setBusy(false);
  };

  return (
    <Card style={styles.form}>
      <ChoiceChips
        options={optionsOf(CONTACT_KIND_LABELS)}
        value={draft.kind}
        onChange={(kind) => change({ kind: (kind ?? 'parent') as ContactKind })}
      />
      <TextField label="שם" value={draft.name} onChange={(name) => change({ name })} />
      <TextField
        label="טלפון"
        value={draft.phone}
        onChange={(phone) => change({ phone })}
        keyboardType="phone-pad"
        placeholder="050-1234567"
      />
      <TextField
        label="קרבה"
        value={draft.relation}
        onChange={(relation) => change({ relation })}
        placeholder="למשל: אמא, אבא"
      />
      <ToggleRow
        label="משלם/ת על השיעורים"
        hint="יקבל/תקבל את תזכורות התשלום"
        value={draft.isPayer}
        onChange={(isPayer) => change({ isPayer })}
      />
      {error && <FieldHint danger>{error}</FieldHint>}
      <View style={formStyles.row}>
        <View style={formStyles.rowItem}>
          <Button label="שמירה" onPress={save} busy={busy} />
        </View>
        <View style={formStyles.rowItem}>
          <Button label="ביטול" variant="secondary" onPress={onCancel} />
        </View>
      </View>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Weekly availability
// ---------------------------------------------------------------------------

function AvailabilitySection({ personal, onChanged, readOnly }: SectionProps) {
  const [adding, setAdding] = useState(false);

  return (
    <Section
      title="זמינות שבועית"
      action={!readOnly && !adding ? <LinkButton label="+ הוספה" onPress={() => setAdding(true)} /> : null}>
      {personal.availability.length === 0 && !adding && (
        <EmptyText>לא צוינו זמנים קבועים שבהם נוח לקבוע שיעורים.</EmptyText>
      )}
      {personal.availability.length > 0 && (
        <Card>
          {personal.availability.map((window) => (
            <View key={window.id} style={styles.itemHeader}>
              <ThemedText type="small" style={styles.flex}>
                יום {WEEKDAY_LABELS[window.weekday]} · {formatMinutes(window.startMin)}–{formatMinutes(window.endMin)}
              </ThemedText>
              {!readOnly && (
                <LinkButton
                  label="מחיקה"
                  danger
                  onPress={() =>
                    remove('מחיקת זמן', () => deletePersonalRow('student_availability', window.id), onChanged)
                  }
                />
              )}
            </View>
          ))}
        </Card>
      )}
      {adding && (
        <AvailabilityForm
          onCancel={() => setAdding(false)}
          onSave={async (window) => {
            const saved = await run(addAvailability(personal.profileId, window), onChanged);
            if (saved) setAdding(false);
          }}
        />
      )}
    </Section>
  );
}

function AvailabilityForm({
  onSave,
  onCancel,
}: {
  onSave: (window: { weekday: number; startMin: number; endMin: number }) => Promise<void>;
  onCancel: () => void;
}) {
  const [weekday, setWeekday] = useState(0);
  const [start, setStart] = useState('16:00');
  const [end, setEnd] = useState('19:00');
  const [busy, setBusy] = useState(false);
  const startMin = parseMinutes(start);
  const endMin = parseMinutes(end);
  const error =
    startMin === null || endMin === null ? 'שעה בפורמט 16:30' : endMin <= startMin ? 'שעת הסיום אחרי ההתחלה' : null;

  return (
    <Card style={styles.form}>
      <ChoiceChips
        options={WEEKDAY_LABELS.map((label, index) => ({ value: index, label }))}
        value={weekday}
        onChange={(day) => setWeekday(day ?? 0)}
      />
      <View style={formStyles.row}>
        <View style={formStyles.rowItem}>
          <TextField label="משעה" value={start} onChange={setStart} keyboardType="numbers-and-punctuation" />
        </View>
        <View style={formStyles.rowItem}>
          <TextField label="עד שעה" value={end} onChange={setEnd} keyboardType="numbers-and-punctuation" />
        </View>
      </View>
      {error && <FieldHint danger>{error}</FieldHint>}
      <View style={formStyles.row}>
        <View style={formStyles.rowItem}>
          <Button
            label="הוספה"
            disabled={error !== null}
            busy={busy}
            onPress={async () => {
              if (startMin === null || endMin === null) return;
              setBusy(true);
              await onSave({ weekday, startMin, endMin });
              setBusy(false);
            }}
          />
        </View>
        <View style={formStyles.rowItem}>
          <Button label="ביטול" variant="secondary" onPress={onCancel} />
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  form: {
    gap: Spacing.two,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  itemActions: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  street: {
    flex: 2,
  },
});
