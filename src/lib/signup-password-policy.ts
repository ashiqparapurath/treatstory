// Mirrors the password requirements selected for TreatStory in Firebase Authentication.
// Firebase remains the final authority; the signup form also calls validatePassword().
export const MIN_SIGNUP_PASSWORD_LENGTH = 12;
export const MAX_SIGNUP_PASSWORD_LENGTH = 4096;

// Firebase's documented non-alphanumeric characters for password policies.
const firebaseSpecialCharacters = String.raw`^$*.[]{}()?"!@#%&/\,><':;|_~`;

export function signupPasswordRequirements(password: string) {
  return [
    { key: 'length', label: '12–4,096 characters', met: password.length >= MIN_SIGNUP_PASSWORD_LENGTH && password.length <= MAX_SIGNUP_PASSWORD_LENGTH },
    { key: 'uppercase', label: 'An uppercase letter', met: /[A-Z]/.test(password) },
    { key: 'lowercase', label: 'A lowercase letter', met: /[a-z]/.test(password) },
    { key: 'number', label: 'A number', met: /[0-9]/.test(password) },
    { key: 'special', label: 'A special character', met: Array.from(password).some(character => firebaseSpecialCharacters.includes(character)) },
  ] as const;
}

export function meetsSignupPasswordPolicy(password: string) {
  return signupPasswordRequirements(password).every(requirement => requirement.met);
}

export function signupPasswordNotice(password: string) {
  const missing = signupPasswordRequirements(password).filter(requirement => !requirement.met);
  return missing.length
    ? { title: 'Choose a stronger password', description: `Your password needs ${missing.map(requirement => requirement.label.toLowerCase()).join(', ')}.`, field: 'password' as const }
    : null;
}
