import { Alert, Platform } from 'react-native';

/** Alert.alert does nothing on web, so these fall back to the browser dialogs there. */
export function showMessage(title: string, message: string) {
  if (Platform.OS === 'web') window.alert(`${title}\n${message}`);
  else Alert.alert(title, message, [{ text: 'אישור' }]);
}

export function confirmAction(
  title: string,
  message: string,
  confirmText: string,
  onConfirm: () => void,
  { destructive = true } = {}
) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: 'ביטול', style: 'cancel' },
    { text: confirmText, style: destructive ? 'destructive' : 'default', onPress: onConfirm },
  ]);
}
