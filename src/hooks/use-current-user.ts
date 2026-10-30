export type CurrentUser = {
  name: string;
};

/** Sample teacher shown until the app has real sign-in. Set to null to see the signed-out state. */
const SAMPLE_USER: CurrentUser | null = { name: 'ישראל' };

/**
 * The teacher who is signed in to the app, or null if nobody is.
 * The app is not connected to a backend yet, so this returns a sample user.
 */
export function useCurrentUser(): CurrentUser | null {
  return SAMPLE_USER;
}
