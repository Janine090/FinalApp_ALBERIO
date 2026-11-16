import type { CSSProperties } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import AppButton from '@/components/AppButton';
import { COLORS } from '@/constants/colors';
import { RADIUS, SPACING } from '@/constants/theme';

import type { DateTimeInputProps } from './DateTimeInput.types';

function toInputValue(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function DateTimeInput({
  label,
  value,
  onChange,
  onClose,
}: DateTimeInputProps) {
  const inputStyle: CSSProperties = {
    width: '100%',
    paddingTop: 10,
    paddingBottom: 10,
    paddingLeft: 12,
    paddingRight: 12,
    borderRadius: RADIUS.sm,
    border: `1px solid ${COLORS.border}`,
    backgroundColor: COLORS.cardAlt,
    color: COLORS.textPrimary,
    fontSize: 15,
    fontFamily: 'inherit',
    colorScheme: 'dark',
    outline: 'none',
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <input
        type="datetime-local"
        value={toInputValue(value)}
        onChange={(event) => {
          if (!event.currentTarget.value) return;
          const next = new Date(event.currentTarget.value);
          if (!Number.isNaN(next.getTime())) onChange(next);
        }}
        style={inputStyle}
      />
      <AppButton
        compact
        variant="secondary"
        title="Done"
        icon="checkmark-outline"
        onPress={onClose}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: SPACING.sm,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: COLORS.primary,
  },
});
