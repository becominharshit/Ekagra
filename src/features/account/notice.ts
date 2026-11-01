// A one-time message for the sign-in page, e.g. after the account was deleted (the app signs out
// right away, so the page that did it is gone). Kept for this browser tab only.

const KEY = 'ekagra-account-notice'

export function setAccountNotice(text: string): void {
  try {
    sessionStorage.setItem(KEY, text)
  } catch {
    // Storage is blocked: the sign-in page just won't say it.
  }
}

export function readAccountNotice(): string | null {
  try {
    return sessionStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function clearAccountNotice(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // Nothing was kept.
  }
}
